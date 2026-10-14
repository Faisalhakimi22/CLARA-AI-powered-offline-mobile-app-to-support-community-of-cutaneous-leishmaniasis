import React from 'react';
import { View } from 'react-native';
import { Assessment } from '../domain/types';
import { clinicalQuestions, formatDate } from '../domain/clinical';
import { Badge, Card, KeyValue, Note, ResultBadge, SectionLabel, T } from './ui';
import { ImagePreview, SegmentationPreview } from './Illustrations';
import { common } from '../theme';

export function AssessmentSummary({ assessment: a }: { assessment: Assessment }) {
  return (
    <View style={common.stack}>
      <Card>
        <SectionLabel label="Patient details" />
        <KeyValue label="Case ID" value={a.patient.caseId} />
        <KeyValue label="Age" value={a.patient.age || 'Not recorded'} />
        <KeyValue label="Sex" value={a.patient.sex || 'Not recorded'} />
        {a.recorder && (
          <KeyValue label="Recorded by" value={`${a.recorder.name} · ${a.recorder.role}`} />
        )}
        <KeyValue label="Created" value={formatDate(a.createdAt, true)} />
      </Card>
      <Card>
        <SectionLabel label="Original model result" />
        {a.initial ? (
          <ResultBadge prediction={a.initial.prediction} />
        ) : (
          <Badge
            label={a.analysisRun?.status === 'failed' ? 'Analysis unavailable' : 'No model result'}
            tone="neutral"
          />
        )}
        {a.image &&
          (a.segmentation?.lesions.length ? (
            <SegmentationPreview image={a.image} segmentation={a.segmentation} height={240} />
          ) : (
            <ImagePreview image={a.image} height={240} />
          ))}
        {a.initial && (
          <>
            <T style={{ fontSize: 13 }}>{a.initial.message}</T>
            {a.segmentation?.lesions.length !== 0 && (
              <KeyValue
                label="Model score (uncalibrated)"
                value={`${Math.round(a.initial.confidence * 100)}%`}
              />
            )}
          </>
        )}
        {!!a.analysisRun?.failure && (
          <T style={{ fontSize: 13 }}>{a.analysisRun.failure.message}</T>
        )}
        {(a.initial?.modelVersion || a.analysisRun?.modelVersion) && (
          <KeyValue
            label="Model version"
            value={a.initial?.modelVersion ?? a.analysisRun?.modelVersion ?? ''}
          />
        )}
        {a.analysisRun && (
          <>
            <KeyValue
              label="Analysis recorded"
              value={formatDate(a.analysisRun.finishedAt, true)}
            />
            <KeyValue
              label="Last attempt duration"
              value={`${(a.analysisRun.durationMs / 1000).toFixed(1)} seconds`}
            />
          </>
        )}
        {a.quality?.overridden && (
          <Note tone="amber">Photo used with recorded quality limitations.</Note>
        )}
        <Note>This research result is not a diagnosis.</Note>
      </Card>
      {Object.keys(a.clinical).length > 0 && (
        <Card>
          <SectionLabel label="Clinical information" />
          {clinicalQuestions
            .filter((q) => a.clinical[q.key])
            .map((q) => (
              <KeyValue key={q.key} label={q.short} value={a.clinical[q.key] ?? ''} />
            ))}
        </Card>
      )}
      {a.workflow === 'feasibility-v1' && (
        <Card>
          <SectionLabel label="Microscopy result" />
          {a.microscopy ? (
            <>
              <Badge
                label={
                  a.microscopy.result === 'POSITIVE'
                    ? 'Positive'
                    : a.microscopy.result === 'NEGATIVE'
                      ? 'Negative'
                      : 'Inconclusive'
                }
                tone="neutral"
              />
              <KeyValue label="Test date" value={a.microscopy.testedAt.slice(0, 10)} />
              {a.microscopy.specimenId && (
                <KeyValue label="Specimen / report ID" value={a.microscopy.specimenId} />
              )}
              {a.microscopy.laboratory && (
                <KeyValue label="Laboratory" value={a.microscopy.laboratory} />
              )}
              <KeyValue label="Entered by" value={a.microscopy.recordedBy.name} />
              <KeyValue label="Recorded" value={formatDate(a.microscopy.recordedAt, true)} />
              {!!a.microscopy.notes && <T style={{ fontSize: 13 }}>{a.microscopy.notes}</T>}
            </>
          ) : (
            <T tone="muted" style={{ fontSize: 13 }}>
              Not recorded. The laboratory result can be added after this case is saved.
            </T>
          )}
        </Card>
      )}
    </View>
  );
}
