// block-schemas.js — Block type schemas for form generation
// This is a browser script loaded via <script> tag, NOT a module

const BLOCK_SCHEMAS = {
  "card-list": {
    label: "Card List",
    fields: [
      {
        key: "items",
        type: "array",
        label: "Items",
        itemSchema: [
          { key: "emoji",          type: "text",     label: "Emoji",          placeholder: "😱" },
          { key: "title",          type: "text",     label: "Title" },
          { key: "description",    type: "textarea", label: "Description",    placeholder: "줄바꿈은 \\n으로" },
          { key: "highlight_word", type: "text",     label: "Highlight Word", optional: true },
        ],
      },
    ],
  },

  "terminal-block": {
    label: "Terminal Block",
    fields: [
      { key: "title", type: "text", label: "Title", placeholder: "Terminal" },
      {
        key: "lines",
        type: "array",
        label: "Lines",
        itemSchema: [
          {
            key: "type",
            type: "select",
            label: "Line Type",
            options: ["command", "output", "comment"],
          },
          { key: "text",      type: "text", label: "Text" },
          { key: "highlight", type: "text", label: "Highlight", optional: true },
        ],
      },
    ],
  },

  "code-editor": {
    label: "Code Editor",
    fields: [
      { key: "title", type: "text", label: "Title", placeholder: "파일명.md" },
      {
        key: "lines",
        type: "array",
        label: "Lines",
        itemSchema: [
          {
            key: "type",
            type: "select",
            label: "Line Type",
            options: ["code", "comment", "list-item"],
          },
          { key: "text",   type: "text",   label: "Text" },
          { key: "indent", type: "number", label: "Indent (units)", optional: true, placeholder: "0" },
        ],
      },
    ],
  },

  "before-after": {
    label: "Before / After",
    fields: [
      {
        key: "before",
        type: "object",
        label: "Before",
        fields: [
          { key: "emoji",       type: "text",     label: "Emoji",       optional: true },
          { key: "icon_url",    type: "text",     label: "Icon URL",    optional: true },
          { key: "title",       type: "text",     label: "Title" },
          { key: "description", type: "textarea", label: "Description", placeholder: "줄바꿈은 \\n으로" },
          { key: "bg_color",    type: "text",     label: "BG Color",    optional: true, placeholder: "#FFF0F0" },
        ],
      },
      {
        key: "after",
        type: "object",
        label: "After",
        fields: [
          { key: "emoji",       type: "text",     label: "Emoji",       optional: true },
          { key: "icon_url",    type: "text",     label: "Icon URL",    optional: true },
          { key: "title",       type: "text",     label: "Title" },
          { key: "description", type: "textarea", label: "Description", placeholder: "줄바꿈은 \\n으로" },
          { key: "bg_color",    type: "text",     label: "BG Color",    optional: true, placeholder: "#F0FFF4" },
        ],
      },
    ],
  },

  "step-list": {
    label: "Step List",
    fields: [
      {
        key: "items",
        type: "array",
        label: "Steps",
        itemSchema: [
          { key: "step",           type: "number", label: "Step Number",    optional: true },
          { key: "emoji",          type: "text",   label: "Emoji",          placeholder: "🚀" },
          { key: "title",          type: "text",   label: "Title" },
          { key: "description",    type: "textarea", label: "Description",  placeholder: "줄바꿈은 \\n으로" },
          { key: "code",           type: "text",   label: "Inline Code",    optional: true },
          { key: "highlight_word", type: "text",   label: "Highlight Word", optional: true },
        ],
      },
    ],
  },

  "tip-box": {
    label: "Tip Box",
    fields: [
      { key: "icon",           type: "text",     label: "Icon",           optional: true, placeholder: "💡" },
      { key: "label",          type: "text",     label: "Label",          placeholder: "Tip" },
      { key: "content",        type: "textarea", label: "Content",        placeholder: "줄바꿈은 \\n으로" },
      { key: "highlight_word", type: "text",     label: "Highlight Word", optional: true },
    ],
  },

  "info-box": {
    label: "Info Box",
    fields: [
      { key: "icon",           type: "text",     label: "Icon",           optional: true, placeholder: "ℹ️" },
      { key: "title",          type: "text",     label: "Title" },
      { key: "content",        type: "textarea", label: "Content",        placeholder: "줄바꿈은 \\n으로" },
      { key: "highlight_word", type: "text",     label: "Highlight Word", optional: true },
    ],
  },

  "highlight-banner": {
    label: "Highlight Banner",
    fields: [
      { key: "content",     type: "textarea", label: "Content" },
      { key: "bold_part",   type: "text",     label: "Bold Part",    optional: true },
      { key: "inline_code", type: "text",     label: "Inline Code",  optional: true },
    ],
  },

  "table": {
    label: "Table",
    fields: [
      {
        key: "columns",
        type: "array",
        label: "Columns",
        itemSchema: [
          { key: "header",          type: "text", label: "Header" },
          { key: "highlight_color", type: "text", label: "Highlight Color", optional: true, placeholder: "#6B9B7D" },
        ],
      },
      {
        key: "rows",
        type: "array",
        label: "Rows",
        itemSchema: [
          { key: "label", type: "text", label: "Row Label" },
          {
            key: "cells",
            type: "array",
            label: "Cells",
            itemSchema: [
              { key: "text",            type: "textarea", label: "Cell Text" },
              { key: "highlight_color", type: "text",     label: "Highlight Color", optional: true, placeholder: "#6B9B7D" },
            ],
          },
        ],
      },
    ],
  },

  "progress-bar": {
    label: "Progress Bar",
    fields: [
      { key: "label",        type: "text",   label: "Label" },
      { key: "value",        type: "number", label: "Value (0–100)" },
      { key: "display_text", type: "text",   label: "Display Text", optional: true, placeholder: "87%" },
      { key: "color",        type: "text",   label: "Bar Color",    optional: true, placeholder: "#D4845C" },
    ],
  },

  "bar-list": {
    label: "Bar List",
    fields: [
      {
        key: "items",
        type: "array",
        label: "Items",
        itemSchema: [
          { key: "emoji", type: "text",   label: "Emoji",          optional: true },
          { key: "label", type: "text",   label: "Label" },
          { key: "ratio", type: "number", label: "Ratio (0–100)" },
        ],
      },
    ],
  },

  "text": {
    label: "Text",
    fields: [
      { key: "content", type: "textarea", label: "Content" },
      {
        key: "style",
        type: "select",
        label: "Style",
        optional: true,
        options: ["normal", "muted", "accent"],
      },
    ],
  },

  "number-stat": {
    label: "Number Stat",
    fields: [
      { key: "value",          type: "text", label: "Value",          placeholder: "42%" },
      { key: "label",          type: "text", label: "Label" },
      { key: "highlight_word", type: "text", label: "Highlight Word", optional: true },
    ],
  },

  "quote-box": {
    label: "Quote Box",
    fields: [
      { key: "content", type: "textarea", label: "Content" },
      { key: "author",  type: "text",     label: "Author",  optional: true },
      {
        key: "style",
        type: "select",
        label: "Style",
        optional: true,
        options: ["default", "accent"],
      },
    ],
  },

  "icon-grid": {
    label: "Icon Grid",
    fields: [
      {
        key: "columns",
        type: "select",
        label: "Columns",
        optional: true,
        options: ["2", "3"],
      },
      {
        key: "items",
        type: "array",
        label: "Items",
        itemSchema: [
          { key: "emoji",       type: "text",     label: "Emoji",       placeholder: "🚀" },
          { key: "title",       type: "text",     label: "Title" },
          { key: "description", type: "textarea", label: "Description", optional: true },
        ],
      },
    ],
  },
};

const LAYOUT_OPTIONS = [
  "cover",
  "problem",
  "explanation",
  "solution",
  "howto",
  "comparison",
  "advanced",
  "workflow",
  "split",
  "hero",
  "minimal",
  "closing",
];
