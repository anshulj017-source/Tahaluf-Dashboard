const COMBINED_BIO_CPHI_EVENT_ID = 'bio-cphi-main';

const BIO_CPHI_EVENTS = [
  { id: 'bio-26', name: 'BIO 26', matchName: 'BIO 26', documentName: 'BIO / CPHI shared sheet' },
  { id: 'cphi-26', name: 'CPHI 26', matchName: 'CPHI 26', documentName: 'BIO / CPHI shared sheet' }
];

function getLogicalEvents(configEvent) {
  if (configEvent.id === COMBINED_BIO_CPHI_EVENT_ID) {
    return BIO_CPHI_EVENTS.map(event => ({
      ...configEvent,
      ...event,
      configEventId: configEvent.id,
      sourceName: event.matchName
    }));
  }
  if (configEvent.id === 'cphi-li') {
    return [{
      ...configEvent,
      id: 'cphi-26',
      name: 'CPHI 26',
      sourceName: 'CPHI 26',
      configEventId: configEvent.id,
      documentName: configEvent.name
    }];
  }
  return [{
    ...configEvent,
    configEventId: configEvent.id,
    documentName: configEvent.name
  }];
}

export function getHealthEventDefinitions(configEvents = []) {
  const definitions = new Map();
  for (const configEvent of configEvents) {
    for (const event of getLogicalEvents(configEvent)) {
      if (!definitions.has(event.id)) {
        definitions.set(event.id, {
          id: event.id,
          name: event.name,
          status: event.status,
          visibility: event.visibility
        });
      }
    }
  }
  return [...definitions.values()];
}

export function isHealthEventId(configEvents = [], eventId) {
  return getHealthEventDefinitions(configEvents).some(event => event.id === eventId);
}

export function getHealthEventSources(configEvents = []) {
  const sources = configEvents.flatMap(configEvent => getLogicalEvents(configEvent).flatMap(event => [
    {
      ...event,
      eventId: event.id,
      eventName: event.name,
      kind: 'Actuals',
      gid: configEvent.gid || '',
      sourceDocumentName: event.documentName,
      sourceDocumentId: configEvent.id
    },
    ...(configEvent.plannedGid
      ? [{
          ...event,
          eventId: event.id,
          eventName: event.name,
          kind: 'Planned',
          gid: configEvent.plannedGid,
          sourceDocumentName: `${event.name} Planned`,
          sourceDocumentId: `${configEvent.id}:planned`
        }]
      : [])
  ])).filter(source => source.gid);
  const unique = new Map();
  for (const source of sources) {
    const key = `${source.eventId}:${source.kind}:${source.sourceDocumentId}`;
    if (!unique.has(key)) unique.set(key, source);
  }
  return [...unique.values()];
}
