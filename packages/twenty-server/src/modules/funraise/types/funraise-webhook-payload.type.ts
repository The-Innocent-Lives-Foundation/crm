export type FunraiseSupporter = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string | null;
  // Present on softCreditSupporter (fundraiser) entries
  institutionCategory?: string | null;
  institutionName?: string | null;
  donorType?: string | null;
  totalDonationCount?: number;
  totalDonationAmount?: number;
  recurringStatus?: string | null;
};

export type FunraiseTransaction = {
  amount: number;
  sourceAmount: number;
  currency: string;
  status: string;
  cardType: string | null;
  lastFour: string | null;
  billingFirstName: string | null;
  billingLastName: string | null;
  billingZip: string | null;
  paymentMethod: string | null;
  expirationDate: number | null;
  gatewayType: string | null;
  gatewayResponse: string | null;
  transactionId: string | null;
  errors: unknown;
};

export type FunraiseTransactionData = {
  id: number;
  description: string | null;
  memo: string | null;
  checkNumber: string | null;
  inKindDescription: string | null;
  inKindHideAmount: boolean;
  anonymous: boolean;
  imported: boolean;
  offline: boolean;
  tags: string | null;
  donationDate: number;
  cretime: number;
  updtime: number;
  note: string | null;
  pageUrl: string | null;
  comment: string | null;
  externalId: string | null;
  externalIdSource: string | null;
  transaction: FunraiseTransaction;
  dedication: {
    message: string | null;
    name: string | null;
    email: string | null;
    type: string | null;
  } | null;
  companyMatch: {
    companyName: string | null;
    companyId: string | null;
    employeeEmail: string | null;
  } | null;
  utm: {
    source: string | null;
    medium: string | null;
    content: string | null;
    term: string | null;
    campaign: string | null;
  } | null;
  subscription: {
    id: number;
    sequence: number;
  } | null;
  pledge: {
    futurePaymentDate: number | null;
  } | null;
  tip: {
    amount: number;
    percent: number;
  } | null;
  allocation: {
    id: number;
    name: string;
  } | null;
  form: {
    id: number;
    name: string;
  } | null;
  softCreditSupporter: FunraiseSupporter | null;
  supporter: FunraiseSupporter;
  household: unknown | null;
  campaignPage: {
    id: string;
    name: string;
    shortDescription: string | null;
  } | null;
};

export type FunraiseWebhookPayload = {
  sentAt: number;
  event: string;
  data: FunraiseTransactionData;
};
