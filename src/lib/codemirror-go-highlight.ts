import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { Extension } from '@codemirror/state';

/**
 * Go syntax highlighting for CodeMirror.
 *
 * @codemirror/lang-go only provides the Lezer parser without built-in syntax
 * highlighting. The @lezer/go parser already has style tags applied via
 * propSources, so we only need to provide the HighlightStyle via
 * syntaxHighlighting() with custom light and dark color schemes.
 */

const highlightStyleLight = HighlightStyle.define([
  { tag: t.keyword, color: '#cf222e', fontWeight: 'bold' },
  { tag: t.controlKeyword, color: '#cf222e', fontWeight: 'bold' },
  { tag: t.definitionKeyword, color: '#cf222e', fontWeight: 'bold' },
  { tag: t.moduleKeyword, color: '#cf222e' },

  { tag: t.typeName, color: '#0550ae' },
  { tag: t.className, color: '#0550ae' },
  { tag: t.namespace, color: '#0550ae' },

  { tag: t.function(t.variableName), color: '#8250df' },
  { tag: t.function(t.definition(t.variableName)), color: '#8250df', fontWeight: 'bold' },
  { tag: t.definition(t.variableName), color: '#953800' },
  { tag: t.variableName, color: '#24292f' },

  { tag: t.string, color: '#0a3069' },
  { tag: t.special(t.string), color: '#0a3069' },
  { tag: t.number, color: '#0550ae' },
  { tag: t.bool, color: '#0550ae' },
  { tag: t.null, color: '#0550ae' },
  { tag: t.character, color: '#0a3069' },

  { tag: t.comment, color: '#6e7781', fontStyle: 'italic' },
  { tag: t.lineComment, color: '#6e7781', fontStyle: 'italic' },
  { tag: t.blockComment, color: '#6e7781', fontStyle: 'italic' },

  { tag: t.operator, color: '#cf222e' },
  { tag: t.logicOperator, color: '#cf222e' },
  { tag: t.arithmeticOperator, color: '#cf222e' },
  { tag: t.bitwiseOperator, color: '#cf222e' },
  { tag: t.derefOperator, color: '#cf222e' },
  { tag: t.updateOperator, color: '#cf222e' },
  { tag: t.compareOperator, color: '#cf222e' },
  { tag: t.definitionOperator, color: '#cf222e' },

  { tag: t.punctuation, color: '#6e7781' },
  { tag: t.separator, color: '#6e7781' },
  { tag: t.brace, color: '#6e7781' },
  { tag: t.paren, color: '#6e7781' },
  { tag: t.squareBracket, color: '#6e7781' },
  { tag: t.bracket, color: '#6e7781' },

  { tag: t.labelName, color: '#953800' },
  { tag: t.propertyName, color: '#24292f' },
  { tag: t.self, color: '#953800' },
  { tag: t.modifier, color: '#cf222e' },
]);

const highlightStyleDark = HighlightStyle.define([
  { tag: t.keyword, color: '#ff7b72', fontWeight: 'bold' },
  { tag: t.controlKeyword, color: '#ff7b72', fontWeight: 'bold' },
  { tag: t.definitionKeyword, color: '#ff7b72', fontWeight: 'bold' },
  { tag: t.moduleKeyword, color: '#ff7b72' },

  { tag: t.typeName, color: '#79c0ff' },
  { tag: t.className, color: '#79c0ff' },
  { tag: t.namespace, color: '#79c0ff' },

  { tag: t.function(t.variableName), color: '#d2a8ff' },
  { tag: t.function(t.definition(t.variableName)), color: '#d2a8ff', fontWeight: 'bold' },
  { tag: t.definition(t.variableName), color: '#ffa657' },
  { tag: t.variableName, color: '#e6edf3' },

  { tag: t.string, color: '#a5d6ff' },
  { tag: t.special(t.string), color: '#a5d6ff' },
  { tag: t.number, color: '#79c0ff' },
  { tag: t.bool, color: '#79c0ff' },
  { tag: t.null, color: '#79c0ff' },
  { tag: t.character, color: '#a5d6ff' },

  { tag: t.comment, color: '#8b949e', fontStyle: 'italic' },
  { tag: t.lineComment, color: '#8b949e', fontStyle: 'italic' },
  { tag: t.blockComment, color: '#8b949e', fontStyle: 'italic' },

  { tag: t.operator, color: '#ff7b72' },
  { tag: t.logicOperator, color: '#ff7b72' },
  { tag: t.arithmeticOperator, color: '#ff7b72' },
  { tag: t.bitwiseOperator, color: '#ff7b72' },
  { tag: t.derefOperator, color: '#ff7b72' },
  { tag: t.updateOperator, color: '#ff7b72' },
  { tag: t.compareOperator, color: '#ff7b72' },
  { tag: t.definitionOperator, color: '#ff7b72' },

  { tag: t.punctuation, color: '#8b949e' },
  { tag: t.separator, color: '#8b949e' },
  { tag: t.brace, color: '#8b949e' },
  { tag: t.paren, color: '#8b949e' },
  { tag: t.squareBracket, color: '#8b949e' },
  { tag: t.bracket, color: '#8b949e' },

  { tag: t.labelName, color: '#ffa657' },
  { tag: t.propertyName, color: '#e6edf3' },
  { tag: t.self, color: '#ffa657' },
  { tag: t.modifier, color: '#ff7b72' },
]);

/**
 * Returns CodeMirror extensions that enable Go syntax highlighting.
 * Pass the current theme ('light' or 'dark'). The @lezer/go parser already
 * has style tags applied via propSources, so we only need to provide the
 * HighlightStyle.
 */
export function goHighlightExtensions(theme: 'light' | 'dark'): Extension[] {
  return [
    syntaxHighlighting(
      theme === 'dark' ? highlightStyleDark : highlightStyleLight,
      { fallback: true },
    ),
  ];
}
