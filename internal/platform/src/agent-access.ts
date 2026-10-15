export interface AgentAccessGrant {
  clientId: string;
  clientName: string;
  createdAt: number;
  scopes: string[];
}

export interface AgentAccessPairRequest {
  clientName: string;
  code: string;
  requestId: string;
  scopes: string[];
}

export interface AgentAccessStatus {
  address: string | null;
  enabled: boolean;
  grants: AgentAccessGrant[];
  pending: AgentAccessPairRequest[];
}

export type AgentMcpAccess = "read" | "write" | "full";

export interface AgentMcpSetup {
  args: string[];
  command: string;
  displayCommand: string;
}

export interface AgentAccessManager {
  approve(requestId: string): Promise<AgentAccessStatus>;
  mcpSetup(access: AgentMcpAccess): Promise<AgentMcpSetup>;
  revoke(clientId: string): Promise<AgentAccessStatus>;
  setEnabled(enabled: boolean): Promise<AgentAccessStatus>;
  status(): Promise<AgentAccessStatus>;
}
