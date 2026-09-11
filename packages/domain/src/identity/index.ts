export {
  computeSessionExpiry,
  evaluateSessionValidity,
  generateSessionSecret,
  hashSessionSecret,
  secretMatchesHash,
  type SessionLifecycleFields,
  type SessionValidity,
} from "./session.ts";

export {
  evaluateIdentityLink,
  type ExistingExternalIdentity,
  type ExistingUserByContact,
  type IdentityLinkCandidate,
  type IdentityLinkDecision,
} from "./identity-linking.ts";

export { WORDPRESS_LOGIN_PROVIDER, WORDPRESS_SUBJECT_PATTERN } from "./providers.ts";
