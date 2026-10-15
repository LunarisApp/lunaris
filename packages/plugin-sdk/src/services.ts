import type { SandboxWireObject, SandboxWireValue } from "./sandbox-protocol";
import { valid } from "semver";

export type PluginServiceMethod = (
  input: SandboxWireValue,
) => Promise<SandboxWireValue | undefined> | SandboxWireValue | undefined;

export type PluginServiceMethods = Readonly<Record<string, PluginServiceMethod>>;

export interface PluginServiceDefinition<
  TMethods extends PluginServiceMethods = PluginServiceMethods,
> {
  readonly id: string;
  readonly methods: readonly (keyof TMethods & string)[];
  slot<
    TMetadata extends object,
    TInput,
    TOutput,
  >(id: string): PluginServiceSlotDefinition<TMetadata, TInput, TOutput>;
  readonly version: string;
}

export interface PluginServiceSlotDefinition<
  TMetadata extends object = SandboxWireObject,
  TInput = SandboxWireValue,
  TOutput = SandboxWireValue,
> {
  readonly id: string;
  readonly serviceId: string;
  readonly serviceVersion: string;
}

export interface PluginServiceSlotContribution<
  TMetadata extends object = SandboxWireObject,
  TInput = SandboxWireValue,
  TOutput = SandboxWireValue,
> {
  readonly id: string;
  readonly invoke: (input: TInput) => Promise<TOutput> | TOutput;
  readonly metadata: TMetadata;
}

export interface PluginServiceReference<
  TMethods extends PluginServiceMethods = PluginServiceMethods,
> {
  readonly definition: PluginServiceDefinition<TMethods>;
  readonly optional: boolean;
}

export interface PluginServiceProviderRegistration {
  readonly definition: PluginServiceDefinition;
  readonly implementation: PluginServiceMethods;
}

export interface PluginServiceSlotRegistration {
  readonly contribution: PluginServiceSlotContribution;
  readonly slot: PluginServiceSlotDefinition;
}

export interface RegisteredPluginService<
  TMethods extends PluginServiceMethods = PluginServiceMethods,
> {
  readonly definition: PluginServiceDefinition<TMethods>;
  readonly implementation: TMethods;
  readonly providerId: string;
  readonly providerVersion: string;
}

export interface RegisteredPluginServiceSlotContribution<
  TMetadata extends object = SandboxWireObject,
  TInput = SandboxWireValue,
  TOutput = SandboxWireValue,
> {
  readonly contributorId: string;
  readonly contributorVersion: string;
  readonly id: string;
  readonly invoke: (input: TInput) => Promise<TOutput>;
  readonly metadata: TMetadata;
  readonly slot: PluginServiceSlotDefinition<TMetadata, TInput, TOutput>;
}

export interface PluginServiceStore {
  getService<TMethods extends PluginServiceMethods>(
    consumerId: string,
    definition: PluginServiceDefinition<TMethods>,
  ): RegisteredPluginService<TMethods> | undefined;
  getSlotContributions<
    TMetadata extends object,
    TInput,
    TOutput,
  >(
    consumerId: string,
    slot: PluginServiceSlotDefinition<TMetadata, TInput, TOutput>,
  ): RegisteredPluginServiceSlotContribution<TMetadata, TInput, TOutput>[];
  getVersion(): number;
  invokeService(
    consumerId: string,
    serviceId: string,
    method: string,
    input: SandboxWireValue,
  ): Promise<SandboxWireValue | undefined>;
  invokeSlot(
    consumerId: string,
    registrationId: string,
    input: SandboxWireValue,
  ): Promise<SandboxWireValue>;
  snapshot(consumerId: string): PluginServiceSnapshot;
  subscribe(listener: () => void): () => void;
}

export interface PluginServiceSnapshot {
  providers: Array<{ id: string; methods: string[]; version: string }>;
  slots: Array<{
    contributorId: string;
    contributorVersion: string;
    id: string;
    metadata: SandboxWireObject;
    registrationId: string;
    serviceId: string;
    serviceVersion: string;
    slotId: string;
  }>;
  version: number;
}

const SERVICE_ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/;
const SLOT_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export function definePluginService<TMethods extends PluginServiceMethods>(input: {
  id: string;
  methods: readonly (keyof TMethods & string)[];
  version: string;
}): PluginServiceDefinition<TMethods> {
  if (!SERVICE_ID_PATTERN.test(input.id)) {
    throw new Error(`Invalid extension service ID: ${input.id}`);
  }
  if (!valid(input.version)) {
    throw new Error(`Extension service "${input.id}" has an invalid version`);
  }
  const methods = [...new Set(input.methods)];
  if (methods.some((method) => !SLOT_ID_PATTERN.test(method))) {
    throw new Error(`Extension service "${input.id}" has an invalid method`);
  }
  return Object.freeze({
    id: input.id,
    methods,
    version: input.version,
    slot<TMetadata extends object, TInput, TOutput>(
      id: string,
    ): PluginServiceSlotDefinition<TMetadata, TInput, TOutput> {
      if (!SLOT_ID_PATTERN.test(id)) {
        throw new Error(`Extension service "${input.id}" has an invalid slot`);
      }
      return Object.freeze({ id, serviceId: input.id, serviceVersion: input.version });
    },
  });
}
