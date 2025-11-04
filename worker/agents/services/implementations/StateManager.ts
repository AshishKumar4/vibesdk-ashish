import { IStateManager } from '../interfaces/IStateManager';
import { CodeGenState, BaseProjectState } from '../../core/state';

/**
 * State manager implementation for Durable Objects
 * Generic over TState
 */
export class StateManager<TState extends BaseProjectState = CodeGenState> implements IStateManager<TState> {
    constructor(
        private getStateFunc: () => TState,
        private setStateFunc: (state: TState) => void
    ) {}

    getState(): Readonly<TState> {
        return this.getStateFunc();
    }

    setState(newState: TState): void {
        this.setStateFunc(newState);
    }

    updateField<K extends keyof TState>(field: K, value: TState[K]): void {
        const currentState = this.getState();
        this.setState({
            ...currentState,
            [field]: value
        });
    }

    batchUpdate(updates: Partial<TState>): void {
        const currentState = this.getState();
        this.setState({
            ...currentState,
            ...updates
        });
    }
}