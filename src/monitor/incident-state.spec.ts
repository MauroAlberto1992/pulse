import { nextState, TargetState } from './incident-state';

function run(results: boolean[], threshold = 3) {
  let state: TargetState = { consecutiveFailures: 0, openIncident: false };
  const transitions = results.map(ok => {
    const step = nextState(state, ok, threshold);
    state = step.state;
    return step.transition;
  });
  return { state, transitions };
}

describe('nextState', () => {
  it('does not open on a blip below the threshold', () => {
    expect(run([false, false, true]).transitions).toEqual([null, null, null]);
  });

  it('opens once on the threshold-th failure and stays quiet after', () => {
    expect(run([false, false, false, false, false]).transitions).toEqual([
      null,
      null,
      'open',
      null,
      null,
    ]);
  });

  it('closes on the first success after opening, once', () => {
    expect(run([false, false, false, true, true]).transitions).toEqual([
      null,
      null,
      'open',
      'close',
      null,
    ]);
  });

  it('keeps an incident restored at startup open until a success', () => {
    const restored = { consecutiveFailures: 3, openIncident: true };
    expect(nextState(restored, false, 3).transition).toBeNull();
    expect(nextState(restored, true, 3).transition).toBe('close');
  });
});
