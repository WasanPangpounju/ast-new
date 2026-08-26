// Shared helpers for fabricouts (bill) field-level audit logging — used by
// api/warehouse/bill/date and api/warehouse/bill/vatno.
//
// recordKey is fabricouts' business key (vatType-vatNo), since fabricouts has
// no single row id representing "one bill" (1 bill = many rolls sharing
// vatType+vatNo). Caveat: this key changes when vatNo itself is edited, so
// audit history recorded before a vatNo rename is not reachable by looking
// up the bill's new number — only history recorded from that point on is.
export const BILL_AUDIT_TABLE = 'fabricouts'
export const billRecordKey = (vatType: string, vatNo: number) => `${vatType}-${vatNo}`
