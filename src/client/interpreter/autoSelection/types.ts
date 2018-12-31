// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { Event, Uri } from 'vscode';
import { Resource } from '../../common/types';
import { PythonInterpreter } from '../contracts';

export const IInterpreterAutoSeletionProxyService = Symbol('IInterpreterAutoSeletionProxyService');
/**
 * Interface similar to IInterpreterAutoSeletionService, to avoid chickn n egg situation.
 * Do we get python path from config first or get auto selected interpreter first!?
 * However, the class that reads python Path, must first give preference to selected interpreter.
 * But all classes everywhere make use of python settings!
 * Solution - Use a proxy that does nothing first, but later the real instance is injected.
 *
 * @export
 * @interface IInterpreterAutoSeletionProxyService
 */
export interface IInterpreterAutoSeletionProxyService {
    readonly onDidChangeAutoSelectedInterpreter: Event<void>;
    getAutoSelectedInterpreter(resource: Resource): PythonInterpreter | undefined;
    registerInstance?(instance: IInterpreterAutoSeletionProxyService): void;
}

export const IInterpreterAutoSeletionService = Symbol('IInterpreterAutoSeletionService');
export interface IInterpreterAutoSeletionService extends IInterpreterAutoSeletionProxyService {
    readonly onDidChangeAutoSelectedInterpreter: Event<void>;
    autoSelectInterpreter(resource: Resource): Promise<void>;
    setWorkspaceInterpreter(resource: Uri, interpreter: PythonInterpreter | undefined): Promise<void>;
    setGlobalInterpreter(interpreter: PythonInterpreter | undefined): Promise<void>;
}

export enum AutoSelectionRule {
    currentPath = 'currentPath',
    workspaceVirtualEnvs = 'workspaceEnvs',
    settings = 'settings',
    cachedInterpreters = 'cachedInterpreters',
    systemWide = 'system',
    windowsRegistry = 'windowsRegistry'
}

export const IInterpreterAutoSeletionRule = Symbol('IInterpreterAutoSeletionRule');
export interface IInterpreterAutoSeletionRule {
    setNextRule(rule: IInterpreterAutoSeletionRule): void;
    autoSelectInterpreter(resource: Resource, manager?: IInterpreterAutoSeletionService): Promise<void>;
    getPreviouslyAutoSelectedInterpreter(resource: Resource): PythonInterpreter | undefined;
}
