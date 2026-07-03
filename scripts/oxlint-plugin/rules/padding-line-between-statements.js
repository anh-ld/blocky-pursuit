// A faithful port of ESLint's `padding-line-between-statements` rule to oxlint's
// JS plugin API. Behaviour, selectors, and options match ESLint 1:1.
// https://eslint.org/docs/latest/rules/padding-line-between-statements
// Source: https://github.com/eslint/eslint/blob/main/lib/rules/padding-line-between-statements.js
//
// Three things ESLint's SourceCode has that oxlint does not, reimplemented below:
//   - `:statement` esquery selector -> explicit statement-node visitor list
//   - `getFirstTokenBetween`        -> inline token walk in verifyForAlways
//   - `getNodeByRangeIndex`         -> structural isBlockLikeStatement

import { defineRule } from "@oxlint/plugins";

const LT = "[\\r\\n\\u2028\\u2029]";
const PADDING_LINE_SEQUENCE = new RegExp(String.raw`^(\s*?${LT})\s*${LT}(\s*;?)$`, "u");
const CJS_EXPORT = /^(?:module\s*\.\s*)?exports(?:\s*\.|\s*\[|$)/u;
const CJS_IMPORT = /^require\(/u;

// Statement node types ESLint's `:statement` selector matches, expanded to
// include oxlint's TS declaration nodes so the prev/next chain stays correct in
// TypeScript. TS nodes only ever match the `*` selector (no keyword tester
// targets them), so JS behaviour is unchanged.
const STATEMENT_TYPES = [
  "ExpressionStatement",
  "BreakStatement",
  "ContinueStatement",
  "DebuggerStatement",
  "DoWhileStatement",
  "EmptyStatement",
  "ForInStatement",
  "ForOfStatement",
  "ForStatement",
  "IfStatement",
  "LabeledStatement",
  "ReturnStatement",
  "ThrowStatement",
  "TryStatement",
  "WhileStatement",
  "WithStatement",
  "VariableDeclaration",
  "FunctionDeclaration",
  "ClassDeclaration",
  "ImportDeclaration",
  "ExportAllDeclaration",
  "ExportDefaultDeclaration",
  "ExportNamedDeclaration",
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "TSEnumDeclaration",
  "TSModuleDeclaration",
  "TSGlobalDeclaration",
  "TSImportEqualsDeclaration",
  "TSExportAssignment",
  "TSNamespaceExportDeclaration",
];

const STATEMENT_LIST_PARENTS = new Set(["Program", "BlockStatement", "StaticBlock", "SwitchCase"]);

const isSemicolonToken = token => token.value === ";";
const isNotSemicolonToken = token => token.value !== ";";
const isClosingBraceToken = token => token.value === "}";
const isTokenOnSameLine = (left, right) => left.loc.end.line === right.loc.start.line;

const skipChainExpression = node =>
  node && node.type === "ChainExpression" ? node.expression : node;

const isFunction = node =>
  Boolean(node) &&
  (node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression");

const isDirective = node =>
  node.type === "ExpressionStatement" && typeof node.directive === "string";

/**
 * Checks the given node is an expression statement of IIFE.
 */
function isIIFEStatement(node) {
  if (node.type === "ExpressionStatement") {
    let call = skipChainExpression(node.expression);

    if (call.type === "UnaryExpression") {
      call = skipChainExpression(call.argument);
    }

    return call.type === "CallExpression" && isFunction(call.callee);
  }

  return false;
}

/**
 * Structural stand-in for ESLint's getNodeByRangeIndex check: does the node's
 * last token close a BlockStatement or SwitchStatement? Determined by the type
 * of the node's terminal clause rather than by resolving the token's owner.
 */
function endsWithBlockBrace(node) {
  switch (node.type) {
    case "BlockStatement":
    case "SwitchStatement":
    case "TryStatement":
    case "FunctionDeclaration":
      return true;
    case "IfStatement":
      return endsWithBlockBrace(node.alternate || node.consequent);
    case "ForStatement":
    case "ForInStatement":
    case "ForOfStatement":
    case "WhileStatement":
    case "WithStatement":
      return Boolean(node.body) && endsWithBlockBrace(node.body);
    default:
      return false;
  }
}

/**
 * Checks whether the given node is a block-like statement (its last token is the
 * closing brace of a block).
 */
function isBlockLikeStatement(node) {
  if (node.type === "DoWhileStatement" && node.body.type === "BlockStatement") {
    return true;
  }

  if (isIIFEStatement(node)) {
    return true;
  }

  return endsWithBlockBrace(node);
}

function newKeywordTester(keyword) {
  return { test: (node, sourceCode) => sourceCode.getFirstToken(node).value === keyword };
}

function newSinglelineKeywordTester(keyword) {
  return {
    test: (node, sourceCode) =>
      node.loc.start.line === node.loc.end.line &&
      sourceCode.getFirstToken(node).value === keyword,
  };
}

function newMultilineKeywordTester(keyword) {
  return {
    test: (node, sourceCode) =>
      node.loc.start.line !== node.loc.end.line &&
      sourceCode.getFirstToken(node).value === keyword,
  };
}

function newNodeTypeTester(type) {
  return { test: node => node.type === type };
}

/**
 * Gets the actual last token, ignoring a semicolon-less style leading semicolon.
 */
function getActualLastToken(sourceCode, node) {
  const semiToken = sourceCode.getLastToken(node);
  const prevToken = sourceCode.getTokenBefore(semiToken);
  const nextToken = sourceCode.getTokenAfter(semiToken);

  const isSemicolonLessStyle = Boolean(
    prevToken &&
      nextToken &&
      prevToken.range[0] >= node.range[0] &&
      isSemicolonToken(semiToken) &&
      semiToken.loc.start.line !== prevToken.loc.end.line &&
      semiToken.loc.end.line === nextToken.loc.start.line,
  );

  return isSemicolonLessStyle ? prevToken : semiToken;
}

function replacerToRemovePaddingLines(_, trailingSpaces, indentSpaces) {
  return trailingSpaces + indentSpaces;
}

function verifyForAny() {}

/**
 * `never`: remove blank lines between the two statements. Comments between two
 * blank lines are left alone (the fix bails).
 */
function verifyForNever(context, _, nextNode, paddingLines) {
  if (paddingLines.length === 0) {
    return;
  }

  context.report({
    loc: nextNode.loc,
    messageId: "unexpectedBlankLine",
    fix(fixer) {
      if (paddingLines.length >= 2) {
        return null;
      }

      const prevToken = paddingLines[0][0];
      const nextToken = paddingLines[0][1];
      const start = prevToken.range[1];
      const end = nextToken.range[0];

      const text = context.sourceCode
        .getText()
        .slice(start, end)
        .replace(PADDING_LINE_SEQUENCE, replacerToRemovePaddingLines);

      return fixer.replaceTextRange([start, end], text);
    },
  });
}

/**
 * `always`: insert a blank line between the two statements, after any trailing
 * comments on the previous node's line.
 */
function verifyForAlways(context, prevNode, nextNode, paddingLines) {
  if (paddingLines.length > 0) {
    return;
  }

  context.report({
    loc: nextNode.loc,
    messageId: "expectedBlankLine",
    fix(fixer) {
      const sourceCode = context.sourceCode;
      let prevToken = getActualLastToken(sourceCode, prevNode);

      // Inline of getFirstTokenBetween(prevToken, nextNode) with a filter that
      // skips trailing comments sharing prevToken's line, advancing prevToken.
      let nextToken = nextNode;

      for (;;) {
        const token = sourceCode.getTokenAfter(prevToken, { includeComments: true });

        if (!token || token.range[0] >= nextNode.range[0]) {
          break;
        }

        if (isTokenOnSameLine(prevToken, token)) {
          prevToken = token;
          continue;
        }

        nextToken = token;
        break;
      }

      const insertText = isTokenOnSameLine(prevToken, nextToken) ? "\n\n" : "\n";

      return fixer.insertTextAfter(prevToken, insertText);
    },
  });
}

const PaddingTypes = {
  any: { verify: verifyForAny },
  never: { verify: verifyForNever },
  always: { verify: verifyForAlways },
};

const StatementTypes = {
  "*": { test: () => true },
  "block-like": { test: node => isBlockLikeStatement(node) },
  "cjs-export": {
    test: (node, sourceCode) =>
      node.type === "ExpressionStatement" &&
      node.expression.type === "AssignmentExpression" &&
      CJS_EXPORT.test(sourceCode.getText(node.expression.left)),
  },
  "cjs-import": {
    test: (node, sourceCode) =>
      node.type === "VariableDeclaration" &&
      node.declarations.length > 0 &&
      Boolean(node.declarations[0].init) &&
      CJS_IMPORT.test(sourceCode.getText(node.declarations[0].init)),
  },
  directive: { test: isDirective },
  expression: { test: node => node.type === "ExpressionStatement" && !isDirective(node) },
  iife: { test: isIIFEStatement },
  "multiline-block-like": {
    test: node => node.loc.start.line !== node.loc.end.line && isBlockLikeStatement(node),
  },
  "multiline-expression": {
    test: node =>
      node.loc.start.line !== node.loc.end.line &&
      node.type === "ExpressionStatement" &&
      !isDirective(node),
  },

  "multiline-const": newMultilineKeywordTester("const"),
  "multiline-let": newMultilineKeywordTester("let"),
  "multiline-var": newMultilineKeywordTester("var"),
  "singleline-const": newSinglelineKeywordTester("const"),
  "singleline-let": newSinglelineKeywordTester("let"),
  "singleline-var": newSinglelineKeywordTester("var"),

  block: newNodeTypeTester("BlockStatement"),
  empty: newNodeTypeTester("EmptyStatement"),
  function: newNodeTypeTester("FunctionDeclaration"),

  break: newKeywordTester("break"),
  case: newKeywordTester("case"),
  class: newKeywordTester("class"),
  const: newKeywordTester("const"),
  continue: newKeywordTester("continue"),
  debugger: newKeywordTester("debugger"),
  default: newKeywordTester("default"),
  do: newKeywordTester("do"),
  export: newKeywordTester("export"),
  for: newKeywordTester("for"),
  if: newKeywordTester("if"),
  import: newKeywordTester("import"),
  let: newKeywordTester("let"),
  return: newKeywordTester("return"),
  switch: newKeywordTester("switch"),
  throw: newKeywordTester("throw"),
  try: newKeywordTester("try"),
  var: newKeywordTester("var"),
  while: newKeywordTester("while"),
  with: newKeywordTester("with"),
};

const paddingType = { enum: Object.keys(PaddingTypes) };

const statementType = {
  anyOf: [
    { enum: Object.keys(StatementTypes) },
    {
      type: "array",
      items: { enum: Object.keys(StatementTypes) },
      minItems: 1,
      uniqueItems: true,
    },
  ],
};

export default defineRule({
  create(context) {
    const sourceCode = context.sourceCode;
    const configureList = context.options || [];
    let scopeInfo = null;

    function enterScope() {
      scopeInfo = { upper: scopeInfo, prevNode: null };
    }

    function exitScope() {
      scopeInfo = scopeInfo.upper;
    }

    function match(node, type) {
      let innerStatementNode = node;

      while (innerStatementNode.type === "LabeledStatement") {
        innerStatementNode = innerStatementNode.body;
      }

      if (Array.isArray(type)) {
        return type.some(match.bind(null, innerStatementNode));
      }

      return StatementTypes[type].test(innerStatementNode, sourceCode);
    }

    function getPaddingType(prevNode, nextNode) {
      for (let i = configureList.length - 1; i >= 0; --i) {
        const configure = configureList[i];
        const matched = match(prevNode, configure.prev) && match(nextNode, configure.next);

        if (matched) {
          return PaddingTypes[configure.blankLine];
        }
      }

      return PaddingTypes.any;
    }

    function getPaddingLineSequences(prevNode, nextNode) {
      const pairs = [];
      let prevToken = getActualLastToken(sourceCode, prevNode);

      if (nextNode.loc.start.line - prevToken.loc.end.line >= 2) {
        do {
          const token = sourceCode.getTokenAfter(prevToken, { includeComments: true });

          if (token.loc.start.line - prevToken.loc.end.line >= 2) {
            pairs.push([prevToken, token]);
          }

          prevToken = token;
        } while (prevToken.range[0] < nextNode.range[0]);
      }

      return pairs;
    }

    function verify(node) {
      const parentType = node.parent.type;

      const validParent =
        STATEMENT_LIST_PARENTS.has(parentType) || parentType === "SwitchStatement";

      if (!validParent) {
        return;
      }

      const prevNode = scopeInfo.prevNode;

      if (prevNode) {
        const type = getPaddingType(prevNode, node);
        const paddingLines = getPaddingLineSequences(prevNode, node);

        type.verify(context, prevNode, node, paddingLines);
      }

      scopeInfo.prevNode = node;
    }

    // ESLint relies on `:statement` (verify) firing before the scope-entering
    // handler on the same node. Where a node both is a statement and opens a
    // scope, that order is reproduced by verifying, then entering.
    function verifyThenEnterScope(node) {
      verify(node);
      enterScope();
    }

    const visitor = {
      Program: enterScope,
      "Program:exit": exitScope,
      BlockStatement: verifyThenEnterScope,
      "BlockStatement:exit": exitScope,
      SwitchStatement: verifyThenEnterScope,
      "SwitchStatement:exit": exitScope,
      StaticBlock: enterScope,
      "StaticBlock:exit": exitScope,
      SwitchCase: verifyThenEnterScope,
      "SwitchCase:exit": exitScope,
    };

    for (const type of STATEMENT_TYPES) {
      visitor[type] = verify;
    }

    return visitor;
  },

  meta: {
    type: "layout",
    docs: {
      description: "Require or disallow padding lines between statements",
    },
    fixable: "whitespace",
    schema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          blankLine: paddingType,
          prev: statementType,
          next: statementType,
        },
        additionalProperties: false,
        required: ["blankLine", "prev", "next"],
      },
    },
    messages: {
      unexpectedBlankLine: "Unexpected blank line before this statement.",
      expectedBlankLine: "Expected blank line before this statement.",
    },
  },
});
