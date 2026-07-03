import { definePlugin } from "@oxlint/plugins";
import paddingLineBetweenStatements from "./rules/padding-line-between-statements.js";

export default definePlugin({
  meta: { name: "blocky-pursuit" },
  rules: {
    "padding-line-between-statements": paddingLineBetweenStatements,
  },
});
