// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { Disposable, Event, EventEmitter, FileSystemWatcher, Uri, workspace } from 'vscode';
import { IPlatformService } from '../platform/types';
import { IConfigurationService, ICurrentProcess, IDisposableRegistry } from '../types';
import { cacheResourceSpecificIngterpreterData, clearCachedResourceSpecificIngterpreterData } from '../utils/decorators';
import { EnvironmentVariables, IEnvironmentVariablesProvider, IEnvironmentVariablesService } from './types';

const cacheDuration = 60 * 60 * 1000;
@injectable()
export class EnvironmentVariablesProvider implements IEnvironmentVariablesProvider, Disposable {
    private fileWatchers = new Map<string, FileSystemWatcher>();
    private disposables: Disposable[] = [];
    private changeEventEmitter: EventEmitter<Uri | undefined>;
    constructor(@inject(IEnvironmentVariablesService) private envVarsService: IEnvironmentVariablesService,
        @inject(IDisposableRegistry) disposableRegistry: Disposable[],
        @inject(IPlatformService) private platformService: IPlatformService,
        @inject(IConfigurationService) private readonly configurationService: IConfigurationService,
        @inject(ICurrentProcess) private process: ICurrentProcess) {
        disposableRegistry.push(this);
        this.changeEventEmitter = new EventEmitter();
    }

    public get onDidEnvironmentVariablesChange(): Event<Uri | undefined> {
        return this.changeEventEmitter.event;
    }

    public dispose() {
        this.changeEventEmitter.dispose();
        this.fileWatchers.forEach(watcher => {
            watcher.dispose();
        });
    }
    @cacheResourceSpecificIngterpreterData('getEnvironmentVariables', cacheDuration)
    public async getEnvironmentVariables(resource?: Uri): Promise<EnvironmentVariables> {
        const settings = this.configurationService.getSettings(resource);
        const workspaceFolderUri = this.getWorkspaceFolderUri(resource);
        this.createFileWatcher(settings.envFile, workspaceFolderUri);
        let mergedVars = await this.envVarsService.parseFile(settings.envFile);
        if (!mergedVars) {
            mergedVars = {};
        }
        this.envVarsService.mergeVariables(this.process.env, mergedVars!);
        const pathVariable = this.platformService.pathVariableName;
        const pathValue = this.process.env[pathVariable];
        if (pathValue) {
            this.envVarsService.appendPath(mergedVars!, pathValue);
        }
        if (this.process.env.PYTHONPATH) {
            this.envVarsService.appendPythonPath(mergedVars!, this.process.env.PYTHONPATH);
        }
        return mergedVars;
    }
    private getWorkspaceFolderUri(resource?: Uri): Uri | undefined {
        if (!resource) {
            return;
        }
        const workspaceFolder = workspace.getWorkspaceFolder(resource!);
        return workspaceFolder ? workspaceFolder.uri : undefined;
    }
    private createFileWatcher(envFile: string, workspaceFolderUri?: Uri) {
        if (this.fileWatchers.has(envFile)) {
            return;
        }
        const envFileWatcher = workspace.createFileSystemWatcher(envFile);
        this.fileWatchers.set(envFile, envFileWatcher);
        if (envFileWatcher) {
            this.disposables.push(envFileWatcher.onDidChange(() => this.onEnvironmentFileChanged(envFile, workspaceFolderUri)));
            this.disposables.push(envFileWatcher.onDidCreate(() => this.onEnvironmentFileChanged(envFile, workspaceFolderUri)));
            this.disposables.push(envFileWatcher.onDidDelete(() => this.onEnvironmentFileChanged(envFile, workspaceFolderUri)));
        }
    }
    private onEnvironmentFileChanged(envFile, workspaceFolderUri?: Uri) {
        clearCachedResourceSpecificIngterpreterData('getEnvironmentVariables', workspaceFolderUri);
        clearCachedResourceSpecificIngterpreterData('CustomEnvironmentVariables', workspaceFolderUri);
        this.changeEventEmitter.fire(workspaceFolderUri);
    }
}
