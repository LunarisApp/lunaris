import { AppError, AuthorizationError } from "@app/utils/errors";
import { log } from "evlog";

export class SubscriptionOwnershipMismatchError extends AppError {
  constructor(params: {
    existingOrganizationId: string;
    incomingOrganizationId: string;
    polarSubscriptionId: string;
  }) {
    log.warn({
      context: "SubscriptionOwnershipMismatchError",
      message: "Polar subscription organization conflict",
      args: [params],
    });
    super({
      status: 409,
      message: "Polar subscription organization conflict",
      why: "Subscription is already linked to another organization",
      fix: "Reconcile subscription metadata in Polar.",
    });
  }
}

export class SubscriptionPurchaserMismatchError extends AppError {
  constructor(params: {
    existingUserId: string;
    incomingUserId: string;
    polarSubscriptionId: string;
  }) {
    log.warn({
      args: [params],
      context: "SubscriptionPurchaserMismatchError",
      message: "Polar subscription purchaser conflict",
    });
    super({
      fix: "Reconcile the Polar customer external ID.",
      message: "Polar subscription purchaser conflict",
      status: 409,
      why: "Subscription is already linked to another purchaser",
    });
  }
}

export class OrganizationBillingOwnerRequiredError extends AuthorizationError {
  constructor() {
    super({
      fix: "Ask the organization owner to manage billing.",
      message: "Organization billing is restricted to the owner",
      why: "Only the organization owner can purchase or change its plan",
    });
    this.name = "OrganizationBillingOwnerRequiredError";
  }
}

export class OrganizationBillingUnavailableError extends AppError {
  constructor() {
    super({
      fix: "Configure Polar or try again later.",
      message: "Organization billing is unavailable",
      status: 503,
      why: "The billing provider is not configured",
    });
    this.name = "OrganizationBillingUnavailableError";
  }
}

export class OrganizationPlanMemberLimitError extends AuthorizationError {
  constructor(limit: number) {
    super({
      fix: "Remove members or pending invitations, or choose Business.",
      message: "Organization exceeds the selected plan's member limit",
      why: `The selected plan allows ${limit} members, including pending invitations`,
    });
    this.name = "OrganizationPlanMemberLimitError";
  }
}

export class OrganizationSubscriptionConflictError extends AppError {
  constructor(message = "Organization already has an active subscription") {
    super({
      fix: "Change the existing plan instead of starting another checkout.",
      message,
      status: 409,
      why: "Each organization can have only one active subscription",
    });
    this.name = "OrganizationSubscriptionConflictError";
  }
}

export class OrganizationResourceLimitError extends AuthorizationError {
  constructor(limit: number) {
    super({
      message: "Organization resource limit reached",
      why: `Current organization plan allows ${limit} resources`,
      fix: "Upgrade organization or delete a resource before creating another.",
      reason: "entitlements.organization_resource_limit_reached",
    });
    this.name = "OrganizationResourceLimitError";
  }
}

export class OrganizationMembershipRequiredError extends AuthorizationError {
  constructor() {
    super({
      message: "Organization access denied",
      why: "Current user is not a member of the active organization",
      fix: "Switch to an organization you belong to.",
      reason: "entitlements.organization_mismatch",
    });
    this.name = "OrganizationMembershipRequiredError";
  }
}

export class FeatureAccessRequiredError extends AuthorizationError {
  constructor() {
    super({
      message: "Assistant is unavailable for this account",
      why: "The current user and organization are not eligible for this feature",
      fix: "Contact Lunaris if you believe you should have access.",
      reason: "entitlements.assistant_unavailable",
    });
    this.name = "FeatureAccessRequiredError";
  }
}
