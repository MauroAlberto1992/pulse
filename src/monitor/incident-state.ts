export interface TargetState {
  consecutiveFailures: number;
  openIncident: boolean;
}

export type Transition = 'open' | 'close' | null;

/**
 * An incident opens on the `threshold`-th consecutive failure (so one blip is not an alert) and
 * closes on the first success after that. Exactly one 'open' and one 'close' per incident, which
 * is what drives the one-email-each rule.
 */
export function nextState(
  state: TargetState,
  ok: boolean,
  threshold: number,
): { state: TargetState; transition: Transition } {
  if (ok) {
    return {
      state: { consecutiveFailures: 0, openIncident: false },
      transition: state.openIncident ? 'close' : null,
    };
  }
  const consecutiveFailures = state.consecutiveFailures + 1;
  const opens =
    state.openIncident === false && consecutiveFailures >= threshold;
  return {
    state: { consecutiveFailures, openIncident: state.openIncident || opens },
    transition: opens ? 'open' : null,
  };
}
