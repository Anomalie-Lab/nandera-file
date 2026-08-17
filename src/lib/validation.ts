import { z } from "zod";
import {
  ACT_TYPES,
  DELIVERED_MODES,
  INSP_STATES,
  NEG_OUTCOMES,
  NEG_SAMPLES,
  NEG_STAGES,
  POS_STAGES,
} from "./domain/types";

const MAX_LOGO_CHARS = 900_000; // ~675KB base64 — enough for resized PNG
const MAX_TEXT = 2000;
const MAX_SHORT = 200;

const actTypeValues = ACT_TYPES.map((t) => t[0]) as [string, ...string[]];

const purchaseOrderSchema = z.object({
  id: z.string().min(1).max(64),
  code: z.string().max(MAX_SHORT).default(""),
  ndr: z.string().max(MAX_SHORT).default(""),
  product: z.string().max(MAX_SHORT).default(""),
  qty: z.string().max(MAX_SHORT).default(""),
  value: z.union([z.number(), z.string()]).default(0),
  incoterm: z.string().max(MAX_SHORT).default(""),
  prod: z.union([z.number(), z.string()]).default(0),
  insp: z.string().max(MAX_SHORT).default("Pending"),
  inspDate: z.string().max(MAX_SHORT).default(""),
  cargoReady: z.string().max(MAX_SHORT).default(""),
  eta: z.string().max(MAX_SHORT).default(""),
  port: z.string().max(MAX_SHORT).default(""),
  stage: z.string().max(MAX_SHORT).default("Confirmed"),
});

const negotiationSchema = z.object({
  id: z.string().min(1).max(64),
  ref: z.string().max(MAX_SHORT).default(""),
  topic: z.string().max(MAX_SHORT).default(""),
  next: z.string().max(MAX_SHORT).default(""),
  owner: z.string().max(MAX_SHORT).default(""),
  due: z.string().max(MAX_SHORT).default(""),
  value: z.union([z.number(), z.string()]).default(0),
  stage: z.string().max(MAX_SHORT).default("Inquiry"),
  outcome: z.string().max(MAX_SHORT).default("Open"),
  samples: z.string().max(MAX_SHORT).default("N/A"),
  wonPo: z.string().max(64).optional(),
});

const actionSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(actTypeValues).or(z.string().max(20)),
  text: z.string().max(MAX_TEXT).default(""),
  owner: z.string().max(MAX_SHORT).default(""),
});

const closedSchema = z.object({
  id: z.string().min(1).max(64),
  code: z.string().max(MAX_SHORT).default(""),
  ndr: z.string().max(MAX_SHORT).default(""),
  product: z.string().max(MAX_SHORT).default(""),
  value: z.union([z.number(), z.string()]).default(0),
  delivered: z.string().max(MAX_SHORT).default(""),
  port: z.string().max(MAX_SHORT).default(""),
});

const clientDataSchema = z.object({
  meta: z.object({
    company: z.string().max(MAX_SHORT).default("YOUR LOGO"),
    title: z.string().max(MAX_SHORT).default("Account Status Report"),
    client: z.string().max(MAX_SHORT).min(1),
    accountManager: z.string().max(MAX_SHORT).default(""),
    period: z.string().max(MAX_SHORT).default(""),
    issued: z.string().max(MAX_SHORT).default(""),
    reportNo: z.string().max(MAX_SHORT).default(""),
    tradeLane: z.string().max(MAX_SHORT).default(""),
    preparedBy: z.string().max(MAX_SHORT).default(""),
    contact: z.string().max(MAX_SHORT).default(""),
  }),
  kpi: z.object({
    activeFoot: z.string().max(MAX_SHORT).default(""),
    transitFoot: z.string().max(MAX_SHORT).default(""),
  }),
  pos: z.array(purchaseOrderSchema).max(500),
  neg: z.array(negotiationSchema).max(500),
  act: z.array(actionSchema).max(500),
  closed: z.array(closedSchema).max(500),
});

export const storeSchema = z
  .object({
    activeClientId: z.string().min(1).max(64),
    logo: z
      .string()
      .max(MAX_LOGO_CHARS)
      .nullable()
      .refine(
        (v) =>
          v === null ||
          v.startsWith("data:image/") ||
          v === "",
        { message: "Logo must be a data:image URL or null" }
      )
      .transform((v) => (v === "" ? null : v)),
    settings: z.object({
      deliveredMode: z
        .string()
        .refine((m) => (DELIVERED_MODES as readonly string[]).includes(m), {
          message: "Invalid deliveredMode",
        }),
    }),
    viewer: z
      .object({
        role: z.enum(["SUPERADMIN", "ADMIN", "CLIENT"]),
        canEdit: z.boolean(),
        user: z.string().default(""),
        email: z.string().default(""),
      })
      .optional(),
    clients: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          data: clientDataSchema,
          lastModified: z.string().max(40).optional(),
          access: z
            .object({
              user: z.string().max(200).optional(),
              email: z.string().max(200).optional(),
              password: z.string().max(200),
            })
            .transform((a) => ({
              user: (a.user || a.email || "").trim(),
              password: a.password,
            }))
            .optional(),
        })
      )
      .min(1)
      .max(100),
  })
  .superRefine((store, ctx) => {
    if (!store.clients.some((c) => c.id === store.activeClientId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "activeClientId must reference an existing client",
        path: ["activeClientId"],
      });
    }

    for (const [ci, client] of store.clients.entries()) {
      for (const [pi, p] of client.data.pos.entries()) {
        if (!(POS_STAGES as readonly string[]).includes(p.stage)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid PO stage: ${p.stage}`,
            path: ["clients", ci, "data", "pos", pi, "stage"],
          });
        }
        if (!(INSP_STATES as readonly string[]).includes(p.insp)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid inspection status: ${p.insp}`,
            path: ["clients", ci, "data", "pos", pi, "insp"],
          });
        }
      }
      for (const [ni, n] of client.data.neg.entries()) {
        // Allow legacy Quotation/Negotiation — normalize handles them; reject unknown
        const okStage =
          (NEG_STAGES as readonly string[]).includes(n.stage) ||
          n.stage === "Quotation" ||
          n.stage === "Negotiation";
        if (!okStage) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid negotiation stage: ${n.stage}`,
            path: ["clients", ci, "data", "neg", ni, "stage"],
          });
        }
        if (!(NEG_OUTCOMES as readonly string[]).includes(n.outcome)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid outcome: ${n.outcome}`,
            path: ["clients", ci, "data", "neg", ni, "outcome"],
          });
        }
        if (!(NEG_SAMPLES as readonly string[]).includes(n.samples)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid samples: ${n.samples}`,
            path: ["clients", ci, "data", "neg", ni, "samples"],
          });
        }
      }
    }
  });

export type ValidatedStore = z.infer<typeof storeSchema>;

export const loginSchema = z.object({
  user: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().min(1).max(200).optional(),
  password: z.string().min(1).max(200),
}).superRefine((data, ctx) => {
  if (!(data.user || data.email)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "User is required",
      path: ["user"],
    });
  }
});
