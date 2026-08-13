export type DeliveryStatus = "queued" | "retrying" | "delivered" | "failed" | "cancelled";

export type DeliveryStage = "validate" | "resolve" | "deliver" | "finalize";
