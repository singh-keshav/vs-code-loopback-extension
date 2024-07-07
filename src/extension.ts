/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

interface PropertySchema {
  columnName: string;
  dataType: string;
  nullable: string;
  // Add other properties as needed
}

interface RelationSchema {
  model: string;
  foreignKey: string;
  type: string;
  // Add other properties as needed
}

interface TableSchema {
  name: string;
  properties: {
    [propertyName: string]: PropertySchema;
  };
  relations: {
    [relationName: string]: RelationSchema;
  };
}

export function activate(context: vscode.ExtensionContext) {
  const models: TableSchema[] = [];

  let disposable = vscode.commands.registerCommand("extension.askFolderPath", () => {
    vscode.window
      .showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: true,
        openLabel: "Select Folder",
      })
      .then((uri) => {
        if (uri && uri[0]) {
          vscode.window.showInformationMessage("Selected folder path: " + uri[0].fsPath);

          uri.forEach((uri) => {
            const folderPath = uri.fsPath;

            fs.readdir(folderPath, (err, files) => {
              if (err) {
                vscode.window.showErrorMessage(`Error reading ${folderPath}: ${err.message}`);
                return;
              }

              // Process each file
              files.forEach((file) => {
                if (file.indexOf(".json") === -1) {
                  return;
                }
                const filePath = path.join(folderPath, file);

                const fileContent = fs.readFileSync(filePath, { encoding: "utf-8" });

                const modelDef = JSON.parse(fileContent);

                models.push(modelDef);
              });
            });
          });
        }
      });
  });

  context.subscriptions.push(disposable);

  const modelNameProvider = vscode.languages.registerCompletionItemProvider(
    "javascript",
    {
      provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        // get all text until the `position` and check if it reads `console.`
        // and if so then complete if `log`, `warn`, and `error`

        const linePrefix = document.lineAt(position).text.slice(0, position.character);

        if (linePrefix.endsWith("app.models.")) {
          const completions: vscode.CompletionItem[] = [];

          if (models && models.length > 1) {
            Object.values(models.map((m) => m.name)).forEach((name) => {
              const completion = new vscode.CompletionItem(name, vscode.CompletionItemKind.Field);
              completions.push(completion);
            });

            return completions;
          }
        }

        return undefined;
      },
    },
    "." // triggered whenever a '.' is being typed
  );
  context.subscriptions.push(modelNameProvider);

  const relationNameProvider = vscode.languages.registerCompletionItemProvider(
    "javascript",
    {
      provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        // get all text until the `position` and check if it reads `console.`
        // and if so then complete if `log`, `warn`, and `error`

        const linePrefix = document.lineAt(position).text.slice(0, position.character);

        if (models && models.length > 0 && linePrefix.includes("relation:")) {
          const requiredText = getRequiredText(document, position);

          const parentModel = getParentModel(requiredText, models);
          if (!parentModel) {
            return undefined;
          }
          const nestedModel = getNestedModel(requiredText, parentModel, models);
          if (!nestedModel) {
            return undefined;
          }
          const completions: vscode.CompletionItem[] = [];

          Object.keys(nestedModel.relations).forEach((name) => {
            const completion = new vscode.CompletionItem(name, vscode.CompletionItemKind.Field);
            completions.push(completion);
          });

          return completions;
        }

        if (models && models.length > 0 && linePrefix.includes("where:")) {
          const requiredText = getRequiredText(document, position);

          const parentModel = getParentModel(requiredText, models);
          if (!parentModel) {
            return undefined;
          }
          const nestedModel = getNestedModel(requiredText, parentModel, models);
          if (!nestedModel) {
            return undefined;
          }
          const completions: vscode.CompletionItem[] = [];

          Object.keys(nestedModel.properties).forEach((name) => {
            const completion = new vscode.CompletionItem(name, vscode.CompletionItemKind.Field);
            completions.push(completion);
          });

          return completions;
        }
      },
    },
    "'",
		"{"
  );
  context.subscriptions.push(relationNameProvider);
}

function findRelationsFromText(queryText: string) {
  const regex = /['"]?relation['"]?\s*:\s*['"]?(\w+)['"]?/g;
  return [...String(queryText).matchAll(regex)].map((v) => v[0].split(":")[1].replaceAll(/['"\s]*/g, ""));
}

function getNestedModel(documentText: string, parentModel: TableSchema, models: TableSchema[]) {
  let relations = findRelationsFromText(documentText);
  if (relations.length === 0) {
    return parentModel;
  }
  let startIndex = -1;

  for (let i = relations.length - 1; i >= 0; i--) {
    const relationName = relations[i];
    if (parentModel.relations[relationName]) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    return;
  }

  let nestedModel = parentModel;

  for (let i = startIndex; i < relations.length; i++) {
    const relationName = relations[i];
    const nestedModelName = nestedModel.relations[relationName].model;
    const foundModel = models.find((m) => m.name === nestedModelName);

    if (!foundModel) {
      return null;
    }

    nestedModel = foundModel;
  }

  return nestedModel;
}

function getRequiredText(document: vscode.TextDocument, position: vscode.Position) {
  const startPosition = new vscode.Position(Math.max(position.line - 200, 0), 0);
  const range = new vscode.Range(startPosition, position);
  return document.getText(range);
}

function getParentModel(documentText: string, models: TableSchema[]) {
  const matchingStr = "app.models.";
  const lastIndexOfModel = documentText.lastIndexOf(matchingStr);

  if (lastIndexOfModel === -1) {
    return undefined;
  }

  const arr = documentText.slice(lastIndexOfModel).split(".");

  const model = models.find((m) => m.name === arr[2]);
  return model;
}
