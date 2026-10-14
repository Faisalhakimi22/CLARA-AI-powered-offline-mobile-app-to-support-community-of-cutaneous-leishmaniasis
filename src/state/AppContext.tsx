import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppData, Assessment, MicroscopyEntry } from '../domain/types';
import { initialData, newAssessment } from '../data/defaults';
import { loadData, persistData, resetData } from '../services/storage';
import { canCompleteAssessment } from '../domain/clinical';
import { clearImages } from '../services/imageStorage';
import {
  isSavedStudyAssessment,
  isValidMicroscopy,
  patchStudyDraft,
  protectSavedStudyAssessment,
} from '../domain/study';

interface AppContextValue {
  data: AppData;
  ready: boolean;
  loadError: string | null;
  storageError: string | null;
  toast: string | null;
  notify: (message: string) => void;
  changeData: (update: (previous: AppData) => AppData) => Promise<boolean>;
  updateDraft: (patch: Partial<Assessment>) => void;
  startAssessment: () => void;
  resumeAssessment: (assessment: Assessment) => void;
  saveAssessment: (complete: boolean) => Promise<boolean>;
  recordMicroscopy: (caseId: string, entry: MicroscopyEntry) => Promise<boolean>;
  clearAll: () => Promise<boolean>;
  retrySave: () => Promise<boolean>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(initialData);
  const current = useRef(data);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const revision = useRef(0);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    loadData()
      .then((value) => {
        if (mounted) {
          current.current = value;
          setData(value);
          setReady(true);
        }
      })
      .catch(() => {
        if (mounted) {
          setLoadError(
            'Your saved data could not be opened. You can restart to retry, or clear local data.',
          );
          setReady(true);
        }
      });
    return () => {
      mounted = false;
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    };
  }, []);

  const notify = (message: string) => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast(message);
    toastTimeout.current = setTimeout(() => setToast(null), 3600);
  };

  const changeData = async (update: (previous: AppData) => AppData) => {
    const previous = current.current;
    const proposed = update(previous);
    const originals = new Map(previous.cases.map((a) => [a.id, a]));
    const protect = (a: Assessment) => {
      const old = originals.get(a.id);
      return !old
        ? a
        : old.workflow === 'legacy-triage'
          ? old
          : protectSavedStudyAssessment(old, a);
    };
    const next = {
      ...proposed,
      cases: proposed.cases.map(protect),
      draft: proposed.draft ? protect(proposed.draft) : null,
    };
    current.current = next;
    setData(next);
    const thisRevision = ++revision.current;
    try {
      await persistData(next);
      if (thisRevision === revision.current) setStorageError(null);
      return true;
    } catch {
      setStorageError(
        'Changes are not saved to this device. Storage may be full. Keep this session open and retry.',
      );
      return false;
    }
  };

  const updateDraft = (patch: Partial<Assessment>) => {
    void changeData((prev) =>
      prev.draft ? { ...prev, draft: patchStudyDraft(prev.draft, patch) } : prev,
    );
  };

  const saveAssessment = async (complete: boolean) => {
    if (!current.current.draft) return false;
    const a = current.current.draft;
    if (a.workflow !== 'feasibility-v1' || a.completedAt) return false;
    if (
      current.current.cases.some(
        (record) =>
          record.id !== a.id &&
          record.patient.caseId.trim().toLowerCase() === a.patient.caseId.trim().toLowerCase(),
      )
    ) {
      notify('This case ID already exists. Enter a unique case ID.');
      return false;
    }
    if (complete && !canCompleteAssessment(a)) return false;
    const record: Assessment = {
      ...a,
      updatedAt: new Date().toISOString(),
      status: complete ? 'Completed' : 'Pending Review',
      ...(complete ? { completedAt: new Date().toISOString(), step: 'Summary' } : {}),
    };
    return changeData((prev) => ({
      ...prev,
      draft: complete ? null : record,
      cases: [record, ...prev.cases.filter((item) => item.id !== record.id)],
    }));
  };

  const recordMicroscopy = async (caseId: string, entry: MicroscopyEntry) => {
    const a = current.current.cases.find((record) => record.id === caseId);
    const microscopy = {
      ...entry,
      recordedAt: new Date().toISOString(),
      recordedBy: { ...current.current.profile },
    };
    if (!a || !isSavedStudyAssessment(a) || a.microscopy || !isValidMicroscopy(microscopy))
      return false;
    return changeData((prev) => ({
      ...prev,
      cases: prev.cases.map((record) =>
        record.id === caseId ? { ...record, microscopy } : record,
      ),
    }));
  };

  const clearAll = async () => {
    try {
      await clearImages();
      const empty = { ...initialData(), cases: [], draft: null };
      const ok = await changeData(() => empty);
      if (ok) {
        await resetData();
        setLoadError(null);
      }
      return ok;
    } catch {
      setStorageError('Some local images could not be removed. Please retry.');
      return false;
    }
  };

  return (
    <AppContext.Provider
      value={{
        data,
        ready,
        loadError,
        storageError,
        toast,
        notify,
        changeData,
        updateDraft,
        startAssessment: () => {
          void changeData((prev) => ({ ...prev, draft: newAssessment(prev.profile) }));
        },
        resumeAssessment: (assessment) => {
          if (assessment.workflow !== 'feasibility-v1' || assessment.completedAt) return;
          void changeData((prev) => ({ ...prev, draft: assessment }));
        },
        saveAssessment,
        recordMicroscopy,
        clearAll,
        retrySave: () => changeData((prev) => ({ ...prev })),
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('AppProvider is missing.');
  return context;
}
