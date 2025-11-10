import { IStateManager } from './IStateManager';
import { IFileManager } from './IFileManager';
import { StructuredLogger } from '../../../logger';
import { BaseProjectState } from '../../core/state';

/**
 * Common options for all agent services
 * Works with any state extending BaseProjectState
 */
export interface ServiceOptions {
    env: Env,
    stateManager: IStateManager<BaseProjectState>;
    fileManager: IFileManager;
    getLogger: () => StructuredLogger;
}
