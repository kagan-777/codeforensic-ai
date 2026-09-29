// The list of all security rules the scanner runs.
// To add a rule: create a file exporting a SecurityRule, then add it here.

import type { SecurityRule } from "../../types/scanner";
import { secretRule } from "./secret-rule";
import { sqlInjectionRule } from "./sql-injection-rule";
import { dangerousFunctionRule } from "./dangerous-function-rule";
import { sensitiveOutputRule } from "./sensitive-output-rule";
import { insecureConfigRule } from "./insecure-config-rule";

export const SECURITY_RULES: readonly SecurityRule[] = [
  secretRule,
  sqlInjectionRule,
  dangerousFunctionRule,
  sensitiveOutputRule,
  insecureConfigRule,
];
