import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import vm from "node:vm";

const require = createRequire(import.meta.url);

function loadIssueSessionKeyModule() {
  const filename = path.resolve("lib/remediation/issue-session-key.ts");
  const source = readFileSync(filename, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  });

  const cjsModule = { exports: {} };
  const script = new vm.Script(transpiled.outputText, { filename });
  const context = vm.createContext({
    module: cjsModule,
    exports: cjsModule.exports,
    require,
    __dirname: path.dirname(filename),
    __filename: filename,
    console,
    process,
  });
  script.runInContext(context);
  return cjsModule.exports;
}

const { sentryIssueSessionKey } = loadIssueSessionKeyModule();

test("sentryIssueSessionKey includes the trimmed issue id", () => {
  assert.equal(sentryIssueSessionKey(" 138318075 "), "sentry#138318075");
});

test("sentryIssueSessionKey rejects blank ids", () => {
  assert.throws(() => sentryIssueSessionKey("   "), /Sentry issue ID is required/);
});
