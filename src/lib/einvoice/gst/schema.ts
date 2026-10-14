import { z } from "zod";

/**
 * Zod mirror of the GST e-invoice schema INV-01 v1.1 (spec §9e), as the IRP validates it:
 * amounts are JSON numbers with two decimals, dates DD/MM/YYYY, codes fixed-length. Only the
 * parts okinvo produces are described; optional blocks the app never fills are omitted.
 */
const yn = z.enum(["Y", "N"]);
const money = z.number().finite();
const gstin = z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "not a GSTIN");
const stateCode = z.string().regex(/^\d{2}$/, "two-digit state code");
const text = (max: number) => z.string().min(1).max(max);
const dateDdMmYyyy = z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, "DD/MM/YYYY");

export const SUP_TYPES = ["B2B", "SEZWP", "SEZWOP", "EXPWP", "EXPWOP", "DEXP"] as const;

export const GstPartySchema = z.object({
  Gstin: z.union([gstin, z.literal("URP")]),
  LglNm: text(100),
  TrdNm: text(100).optional(),
  Addr1: text(100),
  Addr2: text(100).optional(),
  Loc: text(100),
  Pin: z.number().int().min(100000).max(999999),
  Stcd: stateCode,
  Ph: z
    .string()
    .regex(/^\d{6,12}$/)
    .optional(),
  Em: z.string().email().max(100).optional(),
});

export const GstBuyerSchema = GstPartySchema.extend({ Pos: stateCode });

export const GstItemSchema = z.object({
  SlNo: text(6),
  PrdDesc: text(300),
  IsServc: yn,
  HsnCd: z.string().regex(/^\d{4,8}$/, "HsnCd must be 4 to 8 digits"),
  Qty: z.number().min(0),
  Unit: text(8),
  UnitPrice: money,
  TotAmt: money,
  Discount: money,
  AssAmt: money,
  GstRt: money,
  IgstAmt: money,
  CgstAmt: money,
  SgstAmt: money,
  CesRt: money,
  TotItemVal: money,
});

export const GstEInvoiceSchema = z.object({
  Version: z.literal("1.1"),
  TranDtls: z.object({
    TaxSch: z.literal("GST"),
    SupTyp: z.enum(SUP_TYPES),
    RegRev: yn,
    IgstOnIntra: yn,
  }),
  DocDtls: z.object({
    Typ: z.enum(["INV", "CRN", "DBN"]),
    No: z.string().regex(/^[A-Za-z0-9/-]{1,16}$/, "document number: up to 16 of A-Z 0-9 / -"),
    Dt: dateDdMmYyyy,
  }),
  SellerDtls: GstPartySchema,
  BuyerDtls: GstBuyerSchema,
  ItemList: z.array(GstItemSchema).min(1).max(1000),
  ValDtls: z.object({
    AssVal: money,
    CgstVal: money,
    SgstVal: money,
    IgstVal: money,
    CesVal: money,
    StCesVal: money,
    Discount: money,
    OthChrg: money,
    RndOffAmt: money,
    TotInvVal: money,
  }),
  ExpDtls: z
    .object({
      ShipBNo: text(20).optional(),
      ShipBDt: dateDdMmYyyy.optional(),
      Port: text(10).optional(),
      RefClm: yn,
      ForCur: z.string().length(3),
      CntCode: z.string().length(2),
    })
    .optional(),
  PayDtls: z
    .object({
      Nm: text(100).optional(),
      AccDet: text(18).optional(),
      Mode: text(18).optional(),
      FinInsBr: text(11).optional(),
      PayTerm: text(100).optional(),
      PayInstr: text(100).optional(),
    })
    .optional(),
});

export type GstEInvoice = z.infer<typeof GstEInvoiceSchema>;
