# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import runpy

runpy.run_module("tests", run_name="__main__", alter_sys=True)
