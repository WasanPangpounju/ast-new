"use client";
import { useState, useEffect, useRef } from "react";
import AiPhotoModal from "@/components/AiPhotoModal";
import { AiReadResult } from "@/hooks/useAiPhotoRead";

const GROUPS = 8;
const ROWS = 20;
const TOTAL_SLOTS = GROUPS * ROWS;

function newSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

interface StockResult {
  fabricStruct: string;
  fabricPattern: string;
  fabricW: string;
  fabricCode: string | null;
  customer: string;
  produced_fold: number;
  produced_yard: number;
  used_fold: number;
  used_yard: number;
}

interface OrderSearchResult {
  id: number;
  purchaseOrder: string;
  customerName: string;
  fabricStructure: string;
  fabricPattern: string;
  fabricId: string;
  fabricW: string;
  orderSumYard: number;
  deliveredYard: number;
  remainingYard: number;
}

// An order queued up to receive rolls from this bill. Multiple orders can be
// linked when the yard total overflows the first one — see linkedOrders below.
interface LinkedOrder {
  id: number;
  purchaseOrder: string;
  remainingYard: number;
}

export default function BillCreatePage() {
  // refId doubles as the DB refId: generated client-side and sent with every
  // save so "บันทึกรายการถัดไป" keeps appending rolls to the same fabricouts
  // record instead of tripping the duplicate-vatNo guard. A fresh id is
  // issued once the bill is closed (บันทึกเสร็จสิ้น / ล้างฟอร์ม).
  const [refId, setRefId] = useState<string>(newSessionId);
  const [savedCount, setSavedCount] = useState(0);

  // Bill header
  const [billType, setBillType] = useState("A");
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [remark, setRemark] = useState(
    "ได้รับผ้าตามรายการข้างบนนี้ไว้ถูกต้องและเรียบร้อยแล้ว",
  );

  // Stock search
  const [stockSearch, setStockSearch] = useState("");
  const [stockResults, setStockResults] = useState<StockResult[]>([]);
  const [stockDropdown, setStockDropdown] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockResult | null>(null);

  // Fabric fields (auto-filled, editable)
  const [fabricStruct, setFabricStruct] = useState("");
  const [fabricPattern, setFabricPattern] = useState("");
  const [fabricW, setFabricW] = useState("");

  // Customer (ผู้สั่ง)
  const [orderer, setOrderer] = useState("");
  const [ordererResults, setOrdererResults] = useState<string[]>([]);
  const [ordererDropdown, setOrdererDropdown] = useState(false);

  // Receiver (ผู้รับ)
  const [receiver, setReceiver] = useState("");
  const [receiverResults, setReceiverResults] = useState<string[]>([]);
  const [receiverDropdown, setReceiverDropdown] = useState(false);

  // Deposit options
  const [isDeposit, setIsDeposit] = useState(false);
  const [altFabricStruct, setAltFabricStruct] = useState("");
  const [altPurchaseOrder, setAltPurchaseOrder] = useState("");
  const [altPurchaseOrderResults, setAltPurchaseOrderResults] = useState<string[]>([]);
  const [altPurchaseOrderDropdown, setAltPurchaseOrderDropdown] = useState(false);

  // Pre-fill from order navigation
  const [purchaseOrderParam, setPurchaseOrderParam] = useState("");

  // Order search (ตัดจากออร์เดอร์)
  const [orderSearch, setOrderSearch] = useState("");
  const [orderResults, setOrderResults] = useState<OrderSearchResult[]>([]);
  const [orderDropdown, setOrderDropdown] = useState(false);
  // Orders queued to receive this bill's rolls, in the order they were picked.
  // When the entered yard total overflows order 1, the overflow auto-assigns
  // to order 2, then order 3, etc. (see remainingYardTotal / handleSave).
  const [linkedOrders, setLinkedOrders] = useState<LinkedOrder[]>([]);

  // Yards grid
  const [yards, setYards] = useState<string[]>(Array(TOTAL_SLOTS).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>(
    Array(TOTAL_SLOTS).fill(null),
  );
  const [saving, setSaving] = useState(false);

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());
  const [aiLowConfidence, setAiLowConfidence] = useState<Set<string>>(
    new Set(),
  );

  // Pre-fill from order query params
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const customerName = p.get("customerName") || "";
    const fs = p.get("fabricStruct") || "";
    const fp = p.get("fabricPattern") || "";
    const fw = p.get("fabricW") || "";

    if (customerName) {
      setOrderer(customerName);
      setReceiver(customerName);
    }
    if (fs) setFabricStruct(fs);
    if (fp) setFabricPattern(fp);
    if (fw) setFabricW(fw);
    const preOrderId = p.get("orderId");
    const prePO = p.get("purchaseOrder");
    if (prePO) setPurchaseOrderParam(prePO);
    if (preOrderId && prePO) {
      // No remainingYard is passed via query params, so look it up the same
      // way the order search dropdown does before queuing it as linked order 1.
      fetch("/api/warehouse/orders/search?q=" + encodeURIComponent(prePO))
        .then((r) => r.json())
        .then((d) => {
          const match = (d.orders ?? []).find(
            (o: OrderSearchResult) => o.id === Number(preOrderId),
          );
          if (match) {
            setLinkedOrders([
              {
                id: match.id,
                purchaseOrder: match.purchaseOrder,
                remainingYard: match.remainingYard,
              },
            ]);
          }
        })
        .catch(() => {});
    }

    if (fs || customerName) {
      const sp = new URLSearchParams();
      if (fs) sp.set("fabricStruct", fs);
      if (fp) sp.set("fabricPattern", fp);
      if (fw) sp.set("fabricW", fw);
      if (customerName) sp.set("customer", customerName);
      fetch("/api/warehouse/stock/search?" + sp)
        .then((r) => r.json())
        .then((data) => {
          if (data.results?.length > 0) {
            const s = data.results[0];
            setSelectedStock(s);
            setStockSearch(
              s.fabricStruct +
                (s.fabricPattern ? " / " + s.fabricPattern : "") +
                (s.fabricW ? " " + s.fabricW + '"' : ""),
            );
            setFabricStruct(s.fabricStruct);
            setFabricPattern(s.fabricPattern ?? "");
            setFabricW(s.fabricW ?? "");
          }
        })
        .catch(() => {});
    }
  }, []);

  // Auto-fill billNo when type changes
  useEffect(() => {
    fetch("/api/warehouse/bill/next-vatno?type=" + billType)
      .then((r) => r.json())
      .then((d) => {
        if (d.nextNo) setBillNo(String(d.nextNo));
      })
      .catch(() => {});
  }, [billType]);

  // Stock search debounce
  useEffect(() => {
    if (!stockSearch) {
      setStockResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch("/api/warehouse/stock/search?q=" + encodeURIComponent(stockSearch))
        .then((r) => r.json())
        .then((d) => setStockResults(d.results ?? []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [stockSearch]);

  // Order search debounce
  useEffect(() => {
    if (!orderSearch) {
      setOrderResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch("/api/warehouse/orders/search?q=" + encodeURIComponent(orderSearch))
        .then((r) => r.json())
        .then((d) => setOrderResults(d.orders ?? []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [orderSearch]);

  // Customer search debounce
  useEffect(() => {
    if (!orderer || orderer.length < 1) {
      setOrdererResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch("/api/warehouse/bill/suggestions?field=customerName&q=" + encodeURIComponent(orderer))
        .then((r) => r.json())
        .then((d) => setOrdererResults(d.data ?? []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [orderer]);

  // Receiver search debounce
  useEffect(() => {
    if (!receiver || receiver.length < 1) {
      setReceiverResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch("/api/warehouse/bill/suggestions?field=receiveName&q=" + encodeURIComponent(receiver))
        .then((r) => r.json())
        .then((d) => setReceiverResults(d.data ?? []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [receiver]);

  // Alt purchase order (แทนผู้สั่งซื้อ) search debounce
  useEffect(() => {
    if (!altPurchaseOrder || altPurchaseOrder.length < 1) {
      setAltPurchaseOrderResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(
        "/api/warehouse/bill/alt-purchase-orders?q=" +
          encodeURIComponent(altPurchaseOrder),
      )
        .then((r) => r.json())
        .then((d) => setAltPurchaseOrderResults(d.data ?? []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [altPurchaseOrder]);

  const setYard = (idx: number, val: string) => {
    setYards((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  };

  const yardNums = yards.map((v) => parseFloat(v) || 0);
  const totalFold = yardNums.filter((v) => v > 0).length;
  const totalYard = yardNums.reduce((a, b) => a + b, 0);

  // Combined remaining capacity across every linked order, and how much the
  // entered total overflows it (used for the over-order warning banner below).
  const remainingYardTotal = linkedOrders.reduce(
    (s, o) => s + o.remainingYard,
    0,
  );
  const overflowYard =
    linkedOrders.length > 0 ? totalYard - remainingYardTotal : 0;

  function handleAiResult(data: AiReadResult) {
    const filled = new Set<string>();
    const lowConf = new Set<string>();
    if (data.fabricStruct != null) {
      setFabricStruct(data.fabricStruct);
      filled.add("fabricStruct");
    }
    if (data.fabricPattern != null) {
      setFabricPattern(data.fabricPattern);
      filled.add("fabricPattern");
    }
    if (data.fabricW != null) {
      setFabricW(data.fabricW);
      filled.add("fabricW");
    }
    if (data.customer != null) {
      setOrderer(data.customer);
      setReceiver(data.customer);
      filled.add("orderer");
    }
    if (data.createDate != null) {
      setBillDate(data.createDate);
      filled.add("billDate");
    }
    if (data.billRef != null) {
      setBillNo(data.billRef);
      filled.add("billNo");
    }
    if (data.rows?.length) {
      const next = Array(TOTAL_SLOTS).fill("");
      data.rows.forEach((row, i) => {
        if (i < TOTAL_SLOTS) next[i] = String(row.yards);
      });
      setYards(next);
    }
    if (data.confidence) {
      Object.entries(data.confidence).forEach(([key, val]) => {
        if (val === "low" || val === "medium") {
          const mapped: Record<string, string> = {
            customer: "orderer",
            billRef: "billNo",
          };
          lowConf.add(mapped[key] ?? key);
        }
      });
    }
    setAiFilledFields(filled);
    setAiLowConfidence(lowConf);
  }

  function aiInputStyle(fieldName: string): React.CSSProperties {
    if (aiLowConfidence.has(fieldName))
      return { borderColor: "#d97706", background: "#fffbeb" };
    if (aiFilledFields.has(fieldName))
      return { borderColor: "#2563eb", background: "#eff6ff" };
    return {};
  }

  // ปิดบิลปัจจุบัน: เคลียร์ทุก field และออก refId ใหม่สำหรับบิลถัดไป
  // (เรียกจากปุ่ม "ล้างฟอร์ม" และท้าย handleSave "บันทึกเสร็จสิ้น")
  function resetForm() {
    setYards(Array(TOTAL_SLOTS).fill(""));
    setStockSearch("");
    setStockResults([]);
    setStockDropdown(false);
    setSelectedStock(null);
    setOrderSearch("");
    setOrderResults([]);
    setOrderDropdown(false);
    setLinkedOrders([]);
    setFabricStruct("");
    setFabricPattern("");
    setFabricW("");
    setOrderer("");
    setReceiver("");
    setIsDeposit(false);
    setAltFabricStruct("");
    setAltPurchaseOrder("");
    setAiFilledFields(new Set());
    setAiLowConfidence(new Set());
    setSavedCount(0);
    setRefId(newSessionId());
  }

  // เคลียร์เฉพาะตารางหลา/พับ ใช้ต่อจากบันทึกสำเร็จของ "บันทึกรายการถัดไป" เท่านั้น
  // คงค่า field หลัก (ประเภทบิล/เลขบิล/ผู้สั่ง/ผู้รับ/โครงสร้างผ้า ฯลฯ) ไว้ทั้งหมด
  // เพราะม้วนถัดไปในบิลเดียวกัน (refId เดิม) เป็นบิลเดิม ต่างกันแค่จำนวนหลาที่คีย์รอบใหม่
  function resetYardsOnly() {
    setYards(Array(TOTAL_SLOTS).fill(""));
  }

  async function handleSave() {
    if (!billType || !orderer || totalFold === 0) {
      alert(
        "กรุณากรอกข้อมูลให้ครบ: ประเภทบิล, ผู้สั่ง, และหลาผ้าอย่างน้อย 1 ช่อง",
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/warehouse/bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vatType: billType,
          vatNo: Number(billNo),
          customerName: orderer,
          receiveName: receiver || orderer,
          fabricStruct,
          fabricPattern,
          fabricW,
          createDate: new Date(billDate).toISOString(),
          yards,
          isDeposit,
          altFabricStruct,
          altPurchaseOrder,
          purchaseOrder: purchaseOrderParam || undefined,
          // Ordered list of linked orders — the API fills order 1 first and
          // auto-assigns any overflow rolls to order 2, 3, ... in this order.
          orderIds:
            linkedOrders.length > 0
              ? linkedOrders.map((o) => o.id)
              : undefined,
          // ถ้าเคยกด "บันทึกรายการถัดไป" มาก่อน ให้ผูกม้วนชุดสุดท้ายนี้เข้า
          // บิลเดิม (refId เดิม) แล้วค่อยปิดบิลผ่าน resetForm()
          refId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      resetForm();
      alert("บันทึกเรียบร้อย");
    } catch (err: any) {
      alert("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  // ต่อเนื่อง: บันทึกม้วนปัจจุบันเข้าบิลเดิม (refId เดิม) แล้วเคลียร์เฉพาะตารางหลา
  // ไม่ redirect เพื่อคีย์ม้วนถัดไปในบิลเดียวกันได้ทันที
  async function handleSaveNext() {
    if (!billType || !orderer || totalFold === 0) {
      alert(
        "กรุณากรอกข้อมูลให้ครบ: ประเภทบิล, ผู้สั่ง, และหลาผ้าอย่างน้อย 1 ช่อง",
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/warehouse/bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vatType: billType,
          vatNo: Number(billNo),
          customerName: orderer,
          receiveName: receiver || orderer,
          fabricStruct,
          fabricPattern,
          fabricW,
          createDate: new Date(billDate).toISOString(),
          yards,
          isDeposit,
          altFabricStruct,
          altPurchaseOrder,
          purchaseOrder: purchaseOrderParam || undefined,
          orderIds:
            linkedOrders.length > 0
              ? linkedOrders.map((o) => o.id)
              : undefined,
          refId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      setSavedCount((c) => c + 1);
      resetYardsOnly();
    } catch (err: unknown) {
      alert(
        "เกิดข้อผิดพลาด: " + (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 w-full">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">เปิดบิลผ้า</h1>
          <p className="text-sm text-gray-500">สร้างบิลส่งผ้าใหม่</p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {aiFilledFields.size > 0 && (
            <>
              <span
                style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  border: "1px solid #bfdbfe",
                }}
              >
                AI กรอก {aiFilledFields.size} field
              </span>
              {aiLowConfidence.size > 0 && (
                <span
                  style={{
                    fontSize: "11px",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    background: "#fffbeb",
                    color: "#92400e",
                    border: "1px solid #fde68a",
                  }}
                >
                  ตรวจสอบ {aiLowConfidence.size} field (สีส้ม)
                </span>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => setAiModalOpen(true)}
            style={{
              padding: "6px 14px",
              fontSize: "13px",
              fontWeight: 500,
              borderRadius: "6px",
              border: "1px solid #2563eb",
              background: "#eff6ff",
              color: "#1d4ed8",
              cursor: "pointer",
              display: 'flex'
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="currentColor"
              className="bi bi-camera-fill mr-1"
              viewBox="0 0 16 16"
            >
              <path d="M10.5 8.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0" />
              <path d="M2 4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.172a2 2 0 0 1-1.414-.586l-.828-.828A2 2 0 0 0 9.172 2H6.828a2 2 0 0 0-1.414.586l-.828.828A2 2 0 0 1 3.172 4zm.5 2a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1m9 2.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0" />
            </svg>{" "}
            อ่านจากรูปถ่าย
          </button>
        </div>
      </div>

      <AiPhotoModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        docType="bill"
        onResult={handleAiResult}
      />

      {/* Header form */}
      <div className="bg-white border border-gray-200 shadow-sm p-4 mb-4 w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {/* Bill type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              ประเภทบิล
            </label>
            <select
              value={billType}
              onChange={(e) => setBillType(e.target.value)}
              className="w-full border border-gray-300 px-3 py-1.5 text-sm h-8.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </div>

          {/* Bill number */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              เลขที่บิล
            </label>
            <input
              value={billNo}
              onChange={(e) => setBillNo(e.target.value)}
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={aiInputStyle("billNo")}
              placeholder="เลขที่บิล"
            />
          </div>

          {/* Bill date */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              วันที่
            </label>
            <input
              type="date"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={aiInputStyle("billDate")}
            />
          </div>

          {/* Stock search - full width */}
          <div className="md:col-span-3 relative">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              ตัดจากสต็อก (เลือกรายการ)
            </label>
            <input
              value={stockSearch}
              onChange={(e) => {
                setStockSearch(e.target.value);
                setStockDropdown(true);
                setSelectedStock(null);
              }}
              onFocus={() => {
                if (stockSearch) setStockDropdown(true);
              }}
              onBlur={() => setTimeout(() => setStockDropdown(false), 200)}
              placeholder="พิมพ์ลูกค้า, โครงสร้างผ้า, ลาย, หน้ากว้าง, หรือรหัสผ้า..."
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {stockDropdown && stockResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 shadow-lg max-h-64 overflow-y-auto">
                {stockResults.map((s, i) => {
                  const remaining = (s.produced_fold ?? 0) - (s.used_fold ?? 0);
                  return (
                    <button
                      key={i}
                      type="button"
                      onMouseDown={() => {
                        setStockSearch(
                          s.fabricStruct +
                            (s.fabricPattern ? " / " + s.fabricPattern : "") +
                            (s.fabricW ? " " + s.fabricW + '"' : ""),
                        );
                        setFabricStruct(s.fabricStruct);
                        setFabricPattern(s.fabricPattern ?? "");
                        setFabricW(s.fabricW ?? "");
                        setOrderer(s.customer);
                        setReceiver(s.customer);
                        setSelectedStock(s);
                        setStockDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 text-xs border-b border-gray-100 last:border-0"
                    >
                      <div className="font-medium text-gray-800">
                        {s.fabricStruct}
                        {s.fabricPattern ? ` / ${s.fabricPattern}` : ""}
                        {s.fabricW ? ` ${s.fabricW}"` : ""}
                        {s.fabricCode ? (
                          <span className="text-gray-400 ml-1">
                            [{s.fabricCode}]
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-0.5 text-gray-500">
                        <span>ลูกค้า: {s.customer}</span>
                        <span className="text-blue-600">
                          ผลิต: {Number(s.produced_fold).toLocaleString()} พับ
                        </span>
                        <span className="text-orange-600">
                          ใช้ไป: {Number(s.used_fold).toLocaleString()} พับ
                        </span>
                        <span
                          style={{
                            color: remaining >= 0 ? "#15803d" : "#dc2626",
                            fontWeight: 600,
                          }}
                        >
                          คงเหลือ: {remaining.toLocaleString()} พับ
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedStock && (
              <div className="mt-1 px-3 py-1.5 bg-blue-50 border border-blue-200 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                <span className="text-blue-700">
                  ผลิตแล้ว:{" "}
                  {Number(selectedStock.produced_fold).toLocaleString()} พับ /{" "}
                  {Math.round(
                    Number(selectedStock.produced_yard),
                  ).toLocaleString()}{" "}
                  หลา
                </span>
                <span className="text-orange-700">
                  ใช้ไป: {Number(selectedStock.used_fold).toLocaleString()} พับ
                  /{" "}
                  {Math.round(Number(selectedStock.used_yard)).toLocaleString()}{" "}
                  หลา
                </span>
                <span
                  className="font-semibold"
                  style={{
                    color:
                      selectedStock.produced_fold - selectedStock.used_fold >= 0
                        ? "#15803d"
                        : "#dc2626",
                  }}
                >
                  คงเหลือ:{" "}
                  {(
                    selectedStock.produced_fold - selectedStock.used_fold
                  ).toLocaleString()}{" "}
                  พับ /{" "}
                  {Math.round(
                    selectedStock.produced_yard - selectedStock.used_yard,
                  ).toLocaleString()}{" "}
                  หลา
                </span>
              </div>
            )}
          </div>

          {/* Order search - full width */}
          <div className="md:col-span-3 relative">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              ตัดจากออร์เดอร์ (เลือก SO)
            </label>
            <input
              value={orderSearch}
              onChange={(e) => {
                setOrderSearch(e.target.value);
                setOrderDropdown(true);
              }}
              onFocus={() => {
                if (orderSearch) setOrderDropdown(true);
              }}
              onBlur={() => setTimeout(() => setOrderDropdown(false), 200)}
              placeholder="พิมพ์เลข SO หรือชื่อลูกค้า..."
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {orderDropdown && orderResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 shadow-lg max-h-64 overflow-y-auto">
                {orderResults.map((o, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseDown={async () => {
                      setOrderSearch(o.purchaseOrder);
                      setOrderDropdown(false);
                      const isFirstOrder = linkedOrders.length === 0;
                      setLinkedOrders((prev) =>
                        prev.some((lo) => lo.id === o.id)
                          ? prev
                          : [
                              ...prev,
                              {
                                id: o.id,
                                purchaseOrder: o.purchaseOrder,
                                remainingYard: o.remainingYard,
                              },
                            ],
                      );
                      // Only order 1 drives the fabric/customer auto-fill and
                      // stock auto-match below — orders added afterwards (to
                      // absorb overflow) are queued as-is, since they're
                      // picked precisely because they match the same fabric.
                      if (!isFirstOrder) return;
                      setFabricStruct(o.fabricStructure);
                      setFabricPattern(o.fabricPattern);
                      setFabricW(o.fabricW);
                      setOrderer(o.customerName);
                      setReceiver(o.customerName);
                      setPurchaseOrderParam(o.purchaseOrder);
                      setSelectedStock(null);
                      setStockSearch("");
                      // Auto-match stock by order's fabric details
                      try {
                        const sp = new URLSearchParams();
                        if (o.fabricStructure)
                          sp.set("fabricStruct", o.fabricStructure);
                        if (o.fabricPattern)
                          sp.set("fabricPattern", o.fabricPattern);
                        if (o.fabricW) sp.set("fabricW", o.fabricW);
                        if (o.customerName) sp.set("customer", o.customerName);
                        const res = await fetch(
                          "/api/warehouse/stock/search?" + sp,
                        );
                        const data = await res.json();
                        if (data.results?.length > 0) {
                          const s = data.results[0];
                          setSelectedStock(s);
                          setStockSearch(
                            s.fabricStruct +
                              (s.fabricPattern ? " / " + s.fabricPattern : "") +
                              (s.fabricW ? " " + s.fabricW + '"' : ""),
                          );
                          setFabricStruct(s.fabricStruct);
                          setFabricPattern(s.fabricPattern ?? "");
                          setFabricW(s.fabricW ?? "");
                        }
                      } catch {}
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-green-50 text-xs border-b border-gray-100 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-green-700">
                        {o.purchaseOrder}
                      </span>
                      <span className="text-gray-700 font-medium">
                        {o.customerName}
                      </span>
                      {o.fabricId && (
                        <span className="text-gray-400">[{o.fabricId}]</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-0.5 text-gray-500">
                      {o.fabricStructure && <span>{o.fabricStructure}</span>}
                      {o.fabricPattern && <span>{o.fabricPattern}</span>}
                      {o.fabricW && <span>{o.fabricW}"</span>}
                      <span className="text-blue-600">
                        สั่ง: {Number(o.orderSumYard).toLocaleString()} หลา
                      </span>
                      <span className="text-orange-600">
                        ส่งแล้ว: {Number(o.deliveredYard).toLocaleString()} หลา
                      </span>
                      <span
                        style={{
                          color: o.remainingYard > 0 ? "#15803d" : "#2563eb",
                          fontWeight: 600,
                        }}
                      >
                        คงค้าง: {Number(o.remainingYard).toLocaleString()} หลา
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {linkedOrders.length > 0 && (
              <div className="mt-1 space-y-1">
                {linkedOrders.map((lo, i) => (
                  <div
                    key={lo.id}
                    className="px-3 py-1.5 bg-green-50 border border-green-200 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs"
                  >
                    <span className="font-mono font-semibold text-green-800">
                      {linkedOrders.length > 1 ? `${i + 1}. ` : ""}SO:{" "}
                      {lo.purchaseOrder}
                    </span>
                    <span className="text-green-700">
                      คงค้าง:{" "}
                      {lo.remainingYard.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}{" "}
                      หลา
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setLinkedOrders((prev) =>
                          prev.filter((x) => x.id !== lo.id),
                        )
                      }
                      className="ml-auto text-green-700 hover:text-red-600"
                    >
                      ลบ
                    </button>
                  </div>
                ))}
                <div className="px-3 text-xs text-green-700">
                  เชื่อมออร์เดอร์แล้ว {linkedOrders.length} รายการ —
                  ยอดคงค้างจะอัปเดตอัตโนมัติเมื่อบันทึก
                </div>
                {overflowYard > 0 && (
                  <div className="px-3 py-1.5 bg-amber-50 border border-amber-300 text-xs text-amber-800">
                    ยอดที่กรอก (
                    {totalYard.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}{" "}
                    หลา) เกินออร์เดอร์ที่เลือก (
                    {remainingYardTotal.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}{" "}
                    หลา) อยู่{" "}
                    {overflowYard.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}{" "}
                    หลา
                    <br />
                    กรุณาเลือกออร์เดอร์เพิ่มเติมเพื่อรับส่วนที่เกิน
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Fabric fields - auto-filled, editable */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              โครงสร้างผ้า
            </label>
            <input
              value={fabricStruct}
              onChange={(e) => setFabricStruct(e.target.value)}
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={aiInputStyle("fabricStruct")}
              placeholder="โครงสร้างผ้า"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              ลายผ้า
            </label>
            <input
              value={fabricPattern}
              onChange={(e) => setFabricPattern(e.target.value)}
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={aiInputStyle("fabricPattern")}
              placeholder="ลายผ้า"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              หน้ากว้าง (นิ้ว)
            </label>
            <input
              value={fabricW}
              onChange={(e) => setFabricW(e.target.value)}
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={aiInputStyle("fabricW")}
              placeholder="หน้ากว้าง"
            />
          </div>

          {/* Orderer with autocomplete */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              ผู้สั่ง (Order by)
            </label>
            <input
              value={orderer}
              onChange={(e) => {
                setOrderer(e.target.value);
                setReceiver(e.target.value);
                setOrdererDropdown(true);
              }}
              onFocus={() => {
                if (orderer) setOrdererDropdown(true);
              }}
              onBlur={() => setTimeout(() => setOrdererDropdown(false), 200)}
              placeholder="พิมพ์ชื่อลูกค้า..."
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={aiInputStyle("orderer")}
            />
            {ordererDropdown && ordererResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                {ordererResults.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onMouseDown={() => {
                      setOrderer(name);
                      setReceiver(name);
                      setOrdererDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-100 last:border-0"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Receiver - editable, auto-filled from orderer */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              ผู้รับ (Received by)
            </label>
            <input
              value={receiver}
              onChange={(e) => {
                setReceiver(e.target.value);
                setReceiverDropdown(true);
              }}
              onFocus={() => {
                if (receiver) setReceiverDropdown(true);
              }}
              onBlur={() => setTimeout(() => setReceiverDropdown(false), 200)}
              placeholder="ชื่อผู้รับ (ถ้าต่างจากผู้สั่ง แก้ได้)"
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {receiverDropdown && receiverResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                {receiverResults.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onMouseDown={() => {
                      setReceiver(name);
                      setReceiverDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-100 last:border-0"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Remark */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              หมายเหตุ
            </label>
            <input
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Extra options */}
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDeposit}
              onChange={(e) => setIsDeposit(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">
              ฝากจัดเก็บ
            </span>
            <span className="text-xs text-gray-400">
              (จะแสดงในสต็อกผ้าฝากจัดเก็บ)
            </span>
          </label>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              แทนโครงสร้างผ้า (ถ้ามี)
            </label>
            <input
              value={altFabricStruct}
              onChange={(e) => setAltFabricStruct(e.target.value)}
              placeholder="ใช้แทนโครงสร้างผ้าจริงในพิมพ์บิล..."
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              แทนผู้สั่งซื้อ (ถ้ามี)
            </label>
            <input
              value={altPurchaseOrder}
              onChange={(e) => {
                setAltPurchaseOrder(e.target.value);
                setAltPurchaseOrderDropdown(true);
              }}
              onFocus={() => {
                if (altPurchaseOrder) setAltPurchaseOrderDropdown(true);
              }}
              onBlur={() =>
                setTimeout(() => setAltPurchaseOrderDropdown(false), 200)
              }
              placeholder="ใช้แทนผู้สั่งซื้อจริงในพิมพ์บิล..."
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {altPurchaseOrderDropdown && altPurchaseOrderResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                {altPurchaseOrderResults.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onMouseDown={() => {
                      setAltPurchaseOrder(v);
                      setAltPurchaseOrderDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-100 last:border-0"
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Summary bar */}
        {totalFold > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 text-xs">
            <span className="text-gray-500">สรุป:</span>
            <span className="font-semibold text-blue-700">
              {totalFold.toLocaleString()} พับ
            </span>
            <span className="font-semibold text-gray-700">
              {totalYard.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}{" "}
              หลา
            </span>
          </div>
        )}
      </div>

      {/* Yards grid */}
      <div className="bg-white border border-gray-200 shadow-sm overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {Array.from({ length: GROUPS }, (_, g) => (
                  <th
                    key={g}
                    colSpan={2}
                    className="border border-gray-400 px-2 py-1 text-center bg-gray-100 font-medium text-gray-600"
                  >
                    ลำดับ&nbsp;&nbsp;หลา
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROWS }, (_, r) => (
                <tr
                  key={r}
                  className={r % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                >
                  {Array.from({ length: GROUPS }, (_, g) => {
                    const idx = g * ROWS + r;
                    const slotNo = idx + 1;
                    return (
                      <td
                        key={g}
                        colSpan={2}
                        className="border border-gray-200 p-0"
                      >
                        <div className="flex items-center">
                          <span className="text-gray-400 text-xs w-7 text-right pr-1 select-none flex-shrink-0">
                            {slotNo}
                          </span>
                          <input
                            ref={(el) => {
                              inputRefs.current[idx] = el;
                            }}
                            type="number"
                            min="0"
                            step="0.5"
                            value={yards[idx]}
                            onChange={(e) => setYard(idx, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const next = inputRefs.current[idx + 1];
                                if (next) next.focus();
                              }
                            }}
                            className="w-full text-right text-xs border-0 outline-none py-1 px-1 focus:bg-yellow-50"
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-yellow-100 font-semibold border-t-2 border-gray-400">
                {Array.from({ length: GROUPS }, (_, g) => {
                  const groupSum = yards
                    .slice(g * ROWS, (g + 1) * ROWS)
                    .reduce((s, v) => s + (parseFloat(v) || 0), 0);
                  return (
                    <td
                      key={g}
                      colSpan={2}
                      className="border border-gray-400 px-2 py-1.5 text-center"
                    >
                      <div className="text-xs text-gray-500">รวม:</div>
                      <div className="text-sm font-bold text-gray-800">
                        {groupSum > 0
                          ? groupSum.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })
                          : "-"}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3">
        {savedCount > 0 && (
          <span className="mr-auto text-xs text-gray-500">
            บันทึกแล้ว {savedCount} รายการ
          </span>
        )}
        <button
          type="button"
          onClick={resetForm}
          className="px-4 py-2 text-sm border border-gray-300 hover:bg-gray-50 text-gray-600"
        >
          ล้างฟอร์ม
        </button>
        <button
          onClick={handleSaveNext}
          disabled={saving}
          className="px-6 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก..." : "บันทึกรายการถัดไป"}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก..." : "บันทึกเสร็จสิ้น"}
        </button>
      </div>
    </div>
  );
}
