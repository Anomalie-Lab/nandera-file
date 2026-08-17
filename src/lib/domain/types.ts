/** Controlled vocabularies — must match the HTML frontend exactly. */

export const POS_STAGES = [
  "Confirmed",
  "In Production",
  "Inspection",
  "Cargo Ready",
  "Booked",
  "Loaded",
  "In Transit",
  "Arrived",
] as const;

export const INSP_STATES = ["Pending", "Booked", "Concluded", "Passed"] as const;
export const NEG_STAGES = ["Inquiry", "Proposal"] as const;
export const NEG_OUTCOMES = ["Open", "Won", "Lost"] as const;
export const NEG_SAMPLES = [
  "N/A",
  "Requested",
  "Pending",
  "Delivered",
  "Approved",
  "Rejected",
] as const;
export const ACT_TYPES = [
  ["red", "Action required"],
  ["gold", "Watch"],
  ["blue", "Logistics"],
  ["client", "Client"],
  ["grn", "Positive"],
] as const;
export const DELIVERED_MODES = ["Hidden", "Count", "Listed"] as const;
export const STOPS = [
  "Inquiry",
  "Proposal",
  "PO Confirmed",
  "Production",
  "Inspection",
  "Cargo Ready",
  "Booked",
  "Loaded",
  "In Transit",
  "Arrived",
  "Delivered",
] as const;
export const PROB: Record<string, number> = { Inquiry: 0.25, Proposal: 0.7 };

export type PosStage = (typeof POS_STAGES)[number];
export type InspState = (typeof INSP_STATES)[number];
export type NegStage = (typeof NEG_STAGES)[number];
export type NegOutcome = (typeof NEG_OUTCOMES)[number];
export type NegSample = (typeof NEG_SAMPLES)[number];
export type ActType = (typeof ACT_TYPES)[number][0];
export type DeliveredMode = (typeof DELIVERED_MODES)[number];

export type Meta = {
  company: string;
  title: string;
  client: string;
  accountManager: string;
  period: string;
  issued: string;
  reportNo: string;
  tradeLane: string;
  preparedBy: string;
  contact: string;
};

export type Kpi = { activeFoot: string; transitFoot: string };

export type PurchaseOrder = {
  id: string;
  code: string;
  ndr: string;
  product: string;
  qty: string;
  value: number | string;
  incoterm: string;
  prod: number | string;
  insp: string;
  inspDate: string;
  cargoReady: string;
  eta: string;
  port: string;
  stage: string;
  qc?: string;
  qcLabel?: string;
};

export type Negotiation = {
  id: string;
  ref: string;
  topic: string;
  next: string;
  owner: string;
  due: string;
  value: number | string;
  stage: string;
  outcome: string;
  samples: string;
  wonPo?: string;
};

export type ActionItem = {
  id: string;
  type: string;
  text: string;
  owner: string;
};

export type ClosedDeal = {
  id: string;
  code: string;
  ndr: string;
  product: string;
  value: number | string;
  delivered: string;
  port: string;
};

export type ClientData = {
  meta: Meta;
  kpi: Kpi;
  pos: PurchaseOrder[];
  neg: Negotiation[];
  act: ActionItem[];
  closed: ClosedDeal[];
};

export type ClientAccess = { user: string; password: string };

export type ClientRecord = {
  id: string;
  data: ClientData;
  lastModified?: string;
  access?: ClientAccess;
};

export type Viewer = {
  role: "SUPERADMIN" | "ADMIN" | "CLIENT";
  canEdit: boolean;
  canManageUsers?: boolean;
  user: string;
  email: string;
};

export type Store = {
  activeClientId: string;
  clients: ClientRecord[];
  logo: string | null;
  settings: { deliveredMode: string };
  viewer?: Viewer;
};
