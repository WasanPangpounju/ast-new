export type MenuItem = {
  key: string
  label: string
  href: string
  group: string
}

export const ALL_MENUS: MenuItem[] = [
  // ─── ระบบซื้อขาย ───────────────────────────────────────
  { key: 'sales.customers',      label: 'ข้อมูลลูกค้า',          href: '/sales/customers',                      group: 'ระบบซื้อขาย' },
  { key: 'sales.suppliers',      label: 'ข้อมูลซัพพลายเออร์',    href: '/sales/suppliers',                      group: 'ระบบซื้อขาย' },
  { key: 'sales.orders-create',  label: 'ใบสั่งขาย',             href: '/sales/orders/create',                  group: 'ระบบซื้อขาย' },
  { key: 'sales.orders-review',  label: 'ตรวจสอบใบสั่งขาย',      href: '/sales/orders/review',                  group: 'ระบบซื้อขาย' },

  // ─── ระบบคลังสินค้า ────────────────────────────────────
  { key: 'warehouse.fabric-in',          label: 'คีย์ผ้าเข้าสต็อก',        href: '/warehouse/stock/create',           group: 'ระบบคลังสินค้า' },
  { key: 'warehouse.fabric-in-scan',     label: 'สแกนรูปคีย์ผ้าเข้าสต็อก', href: '/warehouse/stock/scan',             group: 'ระบบคลังสินค้า' },
  { key: 'warehouse.fabric-review',      label: 'ตรวจสอบคีย์ผ้า',          href: '/warehouse/fabric-in/review',       group: 'ระบบคลังสินค้า' },
  { key: 'warehouse.purchase',           label: 'คีย์ผ้าซื้อเข้า',          href: '/warehouse/stock/purchase',         group: 'ระบบคลังสินค้า' },
  { key: 'warehouse.purchase-review',    label: 'ตรวจสอบผ้าซื้อเข้า',       href: '/warehouse/stock/purchase/review',  group: 'ระบบคลังสินค้า' },
  { key: 'warehouse.bill-create',        label: 'เปิดบิลผ้า',              href: '/warehouse/bill/create',            group: 'ระบบคลังสินค้า' },
  { key: 'warehouse.bill',               label: 'พิมพ์บิลส่งของ',           href: '/warehouse/bill',                   group: 'ระบบคลังสินค้า' },
  { key: 'warehouse.orders',             label: 'ออร์เดอร์ลูกค้า',          href: '/warehouse/orders',                 group: 'ระบบคลังสินค้า' },
  { key: 'warehouse.stock',              label: 'สต็อกผ้า',                href: '/warehouse/stock',                  group: 'ระบบคลังสินค้า' },
  { key: 'warehouse.stock-deposit',      label: 'สต็อกผ้าฝากจัดเก็บ',      href: '/warehouse/stock-deposit',          group: 'ระบบคลังสินค้า' },
  { key: 'warehouse.reports',            label: 'รายงาน',                  href: '/warehouse/reports',                group: 'ระบบคลังสินค้า' },
  { key: 'warehouse.returns',            label: 'ส่งคืนผ้าซัพพลายเออร์',   href: '/warehouse/returns',                group: 'ระบบคลังสินค้า' },

  // ─── ระบบวัตถุดิบ ──────────────────────────────────────
  { key: 'material.create',              label: 'นำเข้าวัตถุดิบ',           href: '/warehouse/material/create',        group: 'ระบบวัตถุดิบ' },
  { key: 'material.history',             label: 'ประวัติการนำเข้า',         href: '/warehouse/material/history',       group: 'ระบบวัตถุดิบ' },
  { key: 'material.requisition',         label: 'เบิกวัตถุดิบภายใน',        href: '/warehouse/material/requisition',   group: 'ระบบวัตถุดิบ' },
  { key: 'material.requisition-history', label: 'ประวัติการเบิก',           href: '/warehouse/material/requisition-history', group: 'ระบบวัตถุดิบ' },
  { key: 'material.outside',             label: 'เบิกวัตถุดิบภายนอก',       href: '/warehouse/material/outside',       group: 'ระบบวัตถุดิบ' },
  { key: 'material.outside-history',     label: 'ประวัติเบิกภายนอก',        href: '/warehouse/material/outside-history', group: 'ระบบวัตถุดิบ' },
  { key: 'material.return',              label: 'คืนวัตถุดิบเข้าสต็อก',      href: '/warehouse/material/return',        group: 'ระบบวัตถุดิบ' },
  { key: 'material.return-history',      label: 'ประวัติการคืน',            href: '/warehouse/material/return-history', group: 'ระบบวัตถุดิบ' },

  // ─── ตั้งค่า ────────────────────────────────────────────
  { key: 'admin.users',                  label: 'จัดการผู้ใช้',             href: '/admin/users',                      group: 'ตั้งค่า' },
]
