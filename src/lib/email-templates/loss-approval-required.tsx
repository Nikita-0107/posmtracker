import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

const SITE_NAME = "POSM Tracker";
const APP_URL = "https://posmtracker.lovable.app";

interface LossApprovalRequiredProps {
  submittedBy?: string;
  submittedByRole?: string;
  wsp?: string;
  distributor?: string;
  materialCode?: string;
  materialName?: string;
  qty?: number | string;
  reason?: string;
  submittedAt?: string;
}

const LossApprovalRequiredEmail = ({
  submittedBy,
  submittedByRole,
  wsp,
  distributor,
  materialCode,
  materialName,
  qty,
  reason,
  submittedAt,
}: LossApprovalRequiredProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Loss approval required on {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Loss Approval Required</Heading>
        <Text style={text}>
          A new loss request has been submitted on {SITE_NAME} and is awaiting
          your review.
        </Text>

        <Section style={card}>
          <Row label="Submitted by" value={submittedBy} />
          <Row label="Role" value={submittedByRole} />
          <Row label="WSP" value={wsp} />
          <Row label="WD" value={distributor} />
          <Row
            label="Material"
            value={
              materialCode && materialName
                ? `${materialCode} · ${materialName}`
                : materialCode ?? materialName
            }
          />
          <Row label="Quantity" value={qty != null ? String(qty) : undefined} />
          <Row label="Reason" value={reason} />
          <Row label="Submitted at" value={submittedAt} />
        </Section>

        <Section style={{ textAlign: "center", margin: "28px 0 8px" }}>
          <Button href={`${APP_URL}/loss-approvals`} style={button}>
            Review request
          </Button>
        </Section>

        <Hr style={hr} />
        <Text style={footer}>
          You are receiving this because you are designated as a loss approver
          on {SITE_NAME}.
        </Text>
      </Container>
    </Body>
  </Html>
);

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <Text style={rowText}>
      <span style={rowLabel}>{label}: </span>
      <span style={rowValue}>{value}</span>
    </Text>
  );
}

export const template = {
  component: LossApprovalRequiredEmail,
  subject: "Loss Approval Required – POSM Tracker",
  displayName: "Loss approval required",
  previewData: {
    submittedBy: "Ravi Kumar",
    submittedByRole: "WSP",
    wsp: "WSP001",
    distributor: "WD123 – Sample Distributor",
    materialCode: "MAT-001",
    materialName: "Sample Shelf Strip",
    qty: 5,
    reason: "Damaged in transit, unusable",
    submittedAt: new Date().toISOString(),
  },
} satisfies TemplateEntry;

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};
const container = { padding: "24px", maxWidth: "560px" };
const h1 = {
  fontSize: "22px",
  fontWeight: "bold",
  color: "#0f172a",
  margin: "0 0 12px",
};
const text = {
  fontSize: "14px",
  color: "#475569",
  lineHeight: "1.6",
  margin: "0 0 20px",
};
const card = {
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  padding: "16px 18px",
  backgroundColor: "#f8fafc",
};
const rowText = { fontSize: "13px", margin: "4px 0", color: "#0f172a" };
const rowLabel = { color: "#64748b", fontWeight: 600 };
const rowValue = { color: "#0f172a" };
const button = {
  backgroundColor: "#d97706",
  color: "#ffffff",
  padding: "11px 22px",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
};
const hr = { borderColor: "#e2e8f0", margin: "24px 0 12px" };
const footer = { fontSize: "12px", color: "#94a3b8", margin: 0 };
