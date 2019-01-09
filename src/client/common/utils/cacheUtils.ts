// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

// tslint:disable:no-any no-require-imports

import { Uri } from 'vscode';
import '../../common/extensions';
import { Resource } from '../types';

type VSCodeType = typeof import('vscode');
type CacheData = {
    value: unknown;
    expiry: number;
};
// const simpleCache = new Map<string, CacheData>();
const resourceSpecificCacheStores = new Map<string, Map<string, CacheData>>();

/**
 * Get a cache key specific to a resource (i.e. workspace)
 * This key will be used to cache interpreter related data, hence the Python Path
 *  used in a workspace will affect the cache key.
 * @param {String} keyPrefix
 * @param {Resource} resource
 * @param {VSCodeType} [vscode=require('vscode')]
 * @returns
 */
function getCacheKey(keyPrefix: string, resource: Resource, vscode: VSCodeType = require('vscode')) {
    const globalPythonPath = vscode.workspace.getConfiguration('python', null as any).get<string>('pythonPath');
    // get workspace related to this resource
    if (!Array.isArray(vscode.workspace.workspaceFolders) || vscode.workspace.workspaceFolders.length === 0) {
        return `${keyPrefix}-${globalPythonPath}`;
    }
    const folder = resource ? vscode.workspace.getWorkspaceFolder(resource) : vscode.workspace.workspaceFolders[0];
    if (!folder) {
        return `${keyPrefix}-${globalPythonPath}`;
    }
    const workspacePythonPath = vscode.workspace.getConfiguration('python', resource).get<string>('pythonPath');
    return `${keyPrefix}-${folder.uri.fsPath}-${workspacePythonPath}`;
}
/**
 * Gets the cache store for a resource that's specific to the interpreter as well.
 * @param {string} keyPrefix
 * @param {Resource} resource
 * @param {VSCodeType} [vscode=require('vscode')]
 * @returns
 */
function getCacheStore(keyPrefix: string, resource: Resource, vscode: VSCodeType = require('vscode')) {
    const key = getCacheKey(keyPrefix, resource, vscode);
    if (!resourceSpecificCacheStores.has(key)) {
        resourceSpecificCacheStores.set(key, new Map<string, CacheData>());
    }
    return resourceSpecificCacheStores.get(key)!;
}

function getCacheKeyFromFunctionArgs(fnArgs: any[]): string {
    return fnArgs.map(arg => `${arg}`).join('-Arg-Separator-');
}

export function clearCache() {
    resourceSpecificCacheStores.clear();
}

export class InMemoryInterpreterSpecificCache<T> {
    private readonly resource: Resource;
    private readonly args: any[];
    constructor(private readonly keyPrefix: string,
        private readonly expiryDurationMs: number,
        args: [Uri | undefined, ...any[]],
        private readonly vscode: VSCodeType = require('vscode')) {
        this.resource = args[0];
        this.args = args.splice(1);
    }
    public get hasData() {
        const store = getCacheStore(this.keyPrefix, this.resource, this.vscode);
        const key = getCacheKeyFromFunctionArgs(this.args);
        const data = store.get(key);
        if (!store.has(key) || !data) {
            return false;
        }
        if (data.expiry < Date.now()) {
            store.delete(key);
            return false;
        }
        return true;
    }
    /**
     * Returns undefined if there is no data.
     * Use of `hasData` to determine whether cached data exists.
     *
     * @type {(T | undefined)}
     * @memberof InMemoryInterpreterSpecificCache
     */
    public get data(): T | undefined {
        if (!this.hasData) {
            return;
        }
        const store = getCacheStore(this.keyPrefix, this.resource, this.vscode);
        const key = getCacheKeyFromFunctionArgs(this.args);
        const data = store.get(key);
        if (!store.has(key) || !data) {
            return;
        }
        return data.value as T;
    }
    public set data(value: T | undefined) {
        const store = getCacheStore(this.keyPrefix, this.resource, this.vscode);
        const key = getCacheKeyFromFunctionArgs(this.args);
        store.set(key, {
            expiry: Date.now() + this.expiryDurationMs,
            value
        });
    }
    public clear() {
        const store = getCacheStore(this.keyPrefix, this.resource, this.vscode);
        const key = getCacheKeyFromFunctionArgs(this.args);
        store.delete(key);
    }
}
