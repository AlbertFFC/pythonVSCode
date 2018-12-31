// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable, named } from 'inversify';
import { compare } from 'semver';
import { Event, EventEmitter, Uri } from 'vscode';
import { IWorkspaceService } from '../../common/application/types';
import '../../common/extensions';
import { IFileSystem } from '../../common/platform/types';
import { IPersistentState, IPersistentStateFactory, Resource } from '../../common/types';
import { PythonInterpreter } from '../contracts';
import { AutoSelectionRule, IInterpreterAutoSeletionRule, IInterpreterAutoSeletionService } from './types';

const preferredGlobalInterpreter = 'preferredGlobalInterpreter';
const workspacePathNameForGlobalWorkspaces = '';

@injectable()
export class InterpreterAutoSeletionService implements IInterpreterAutoSeletionService, IInterpreterAutoSeletionService {
    private readonly didAutoSelectedInterpreterEmitter = new EventEmitter<void>();
    private readonly autoSelectedInterpreterByWorkspace = new Map<string, PythonInterpreter | undefined>();
    private globallyPreferredInterpreter!: IPersistentState<PythonInterpreter | undefined>;
    private readonly rulesToRunInBackground: IInterpreterAutoSeletionRule[] = [];
    constructor(@inject(IWorkspaceService) private readonly workspaceService: IWorkspaceService,
        @inject(IPersistentStateFactory) private readonly stateFactory: IPersistentStateFactory,
        @inject(IFileSystem) private readonly fs: IFileSystem,
        @inject(IInterpreterAutoSeletionRule) @named(AutoSelectionRule.systemWide) systemInterpreter: IInterpreterAutoSeletionRule,
        @inject(IInterpreterAutoSeletionRule) @named(AutoSelectionRule.currentPath) currentPathInterpreter: IInterpreterAutoSeletionRule,
        @inject(IInterpreterAutoSeletionRule) @named(AutoSelectionRule.windowsRegistry) winRegInterpreter: IInterpreterAutoSeletionRule,
        @inject(IInterpreterAutoSeletionRule) @named(AutoSelectionRule.cachedInterpreters) cachedPaths: IInterpreterAutoSeletionRule,
        @inject(IInterpreterAutoSeletionRule) @named(AutoSelectionRule.settings) private readonly userDefinedInterpreter: IInterpreterAutoSeletionRule,
        @inject(IInterpreterAutoSeletionRule) @named(AutoSelectionRule.workspaceVirtualEnvs) workspaceInterpreter: IInterpreterAutoSeletionRule) {

        // It is possible we area always opening the same workspace folder, but we still need to determine and cache
        // the best available interpreters based on other rules (cache for furture use).
        this.rulesToRunInBackground.push(...[winRegInterpreter, currentPathInterpreter, systemInterpreter]);

        // Rules are as follows in order
        // 1. First check user settings.json
        //      If we have user settings, then always use that, do not proceed.
        // 2. Check workspace virtual environments (pipenv, etc).
        //      If we have some, then use those as preferred workspace environments.
        // 3. Check list of cached interpreters (previously cachced from all the rules).
        //      If we find a good one, use that as preferred global env.
        //      Provided its better than what we have already cached as globally preffered interpreter (globallyPreferredInterpreter).
        // 4. Check current path.
        //      If we find a good one, use that as preferred global env.
        //      Provided its better than what we have already cached as globally preffered interpreter (globallyPreferredInterpreter).
        // 5. Check windows registry.
        //      If we find a good one, use that as preferred global env.
        //      Provided its better than what we have already cached as globally preffered interpreter (globallyPreferredInterpreter).
        // 6. Check the entire system.
        //      If we find a good one, use that as preferred global env.
        //      Provided its better than what we have already cached as globally preffered interpreter (globallyPreferredInterpreter).
        userDefinedInterpreter.setNextRule(workspaceInterpreter);
        workspaceInterpreter.setNextRule(cachedPaths);
        cachedPaths.setNextRule(currentPathInterpreter);
        currentPathInterpreter.setNextRule(winRegInterpreter);
        winRegInterpreter.setNextRule(systemInterpreter);
    }
    public async autoSelectInterpreter(resource: Resource): Promise<void> {
        Promise.all(this.rulesToRunInBackground.map(item => item.autoSelectInterpreter(resource))).ignoreErrors();
        await this.initializeStore();
        await this.userDefinedInterpreter.autoSelectInterpreter(resource, this);
    }
    public get onDidChangeAutoSelectedInterpreter(): Event<void> {
        return this.didAutoSelectedInterpreterEmitter.event;
    }
    public getAutoSelectedInterpreter(resource: Resource): PythonInterpreter | undefined {
        // Do not execute anycode other than fetching fromm a property.
        // This method gets invoked from settings class, and this class in turn uses classes that relies on settings.
        // I.e. we can end up in a recursive loop.
        const workspaceFolderPath = this.getWorkspacePathKey(resource);
        if (this.autoSelectedInterpreterByWorkspace.has(workspaceFolderPath)) {
            return this.autoSelectedInterpreterByWorkspace.get(workspaceFolderPath);
        }

        return this.globallyPreferredInterpreter.value;
    }
    public async setWorkspaceInterpreter(resource: Uri, interpreter: PythonInterpreter | undefined) {
        await this.storeAutoSelectedInterperter(resource, interpreter);
    }
    public async setGlobalInterpreter(interpreter: PythonInterpreter) {
        await this.storeAutoSelectedInterperter(undefined, interpreter);
    }
    protected async storeAutoSelectedInterperter(resource: Resource, interpreter: PythonInterpreter | undefined) {
        const workspaceFolderPath = this.getWorkspacePathKey(resource);
        if (workspaceFolderPath === workspacePathNameForGlobalWorkspaces) {
            // Update store only if this version is better.
            if (this.globallyPreferredInterpreter.value &&
                this.globallyPreferredInterpreter.value.version &&
                interpreter && interpreter.version &&
                compare(this.globallyPreferredInterpreter.value.version.raw, interpreter.version.raw) > 0) {
                return;
            }

            // Don't pass in manager instance, as we don't want any updates to take place.
            await this.globallyPreferredInterpreter.updateValue(interpreter);
            this.autoSelectedInterpreterByWorkspace.set(workspaceFolderPath, interpreter);
        } else {
            this.autoSelectedInterpreterByWorkspace.set(workspaceFolderPath, interpreter);
        }

        this.didAutoSelectedInterpreterEmitter.fire();
    }
    protected async initializeStore() {
        if (this.globallyPreferredInterpreter) {
            return;
        }
        await this.clearStoreIfFileIsInvalid();
    }
    private async clearStoreIfFileIsInvalid() {
        this.globallyPreferredInterpreter = this.stateFactory.createGlobalPersistentState<PythonInterpreter | undefined>(preferredGlobalInterpreter, undefined);
        if (this.globallyPreferredInterpreter.value && !await this.fs.fileExists(this.globallyPreferredInterpreter.value.path)) {
            await this.globallyPreferredInterpreter.updateValue(undefined);
        }
    }
    private getWorkspacePathKey(resource: Resource): string {
        const workspaceFolder = resource ? this.workspaceService.getWorkspaceFolder(resource) : undefined;
        return workspaceFolder ? workspaceFolder.uri.fsPath : workspacePathNameForGlobalWorkspaces;
    }
}
