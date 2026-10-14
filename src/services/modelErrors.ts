export class ModelRuntimeUnavailableError extends Error {
  constructor() {
    super(
      'Image analysis requires an installed CLARA build. Expo Go does not include the model runtime. You can save this case without a model result.',
    );
    this.name = 'ModelRuntimeUnavailableError';
  }
}
