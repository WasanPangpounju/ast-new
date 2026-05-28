"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

type NavChild = {
  href: string;
  label: string;
  menuKey: string;
  labelIcon?: React.ReactNode;
};
type NavItem = {
  href?: string;
  label: string;
  icon: React.ReactNode;
  children?: NavChild[];
};

const navItems: NavItem[] = [
  {
    href: "/",
    label: "หน้าหลัก",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        fill="currentColor"
        className="bi bi-house-door-fill"
        viewBox="0 0 16 16"
      >
        <path d="M6.5 14.5v-3.505c0-.245.25-.495.5-.495h2c.25 0 .5.25.5.5v3.5a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.146-.354L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293L8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5v7a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5" />
      </svg>
    ),
  },
  {
    label: "ระบบซื้อขาย",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        fill="currentColor"
        className="bi bi-basket2-fill"
        viewBox="0 0 16 16"
      >
        <path d="M5.929 1.757a.5.5 0 1 0-.858-.514L2.217 6H.5a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h.623l1.844 6.456A.75.75 0 0 0 3.69 15h8.622a.75.75 0 0 0 .722-.544L14.877 8h.623a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-1.717L10.93 1.243a.5.5 0 1 0-.858.514L12.617 6H3.383zM4 10a1 1 0 0 1 2 0v2a1 1 0 1 1-2 0zm3 0a1 1 0 0 1 2 0v2a1 1 0 1 1-2 0zm4-1a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1" />
      </svg>
    ),
    children: [
      {
        href: "/sales/customers",
        label: "ข้อมูลลูกค้า",
        menuKey: "sales.customers",
      },
      {
        href: "/sales/suppliers",
        label: "ข้อมูลซัพพลายเออร์",
        menuKey: "sales.suppliers",
      },
      {
        href: "/sales/orders/create",
        label: "ใบสั่งขาย",
        menuKey: "sales.orders-create",
      },
      {
        href: "/sales/orders/review",
        label: "ตรวจสอบใบสั่งขาย",
        menuKey: "sales.orders-review",
      },
    ],
  },
  {
    label: "ระบบคลังสินค้า",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        fill="currentColor"
        className="bi bi-boxes"
        viewBox="0 0 16 16"
      >
        <path d="M7.752.066a.5.5 0 0 1 .496 0l3.75 2.143a.5.5 0 0 1 .252.434v3.995l3.498 2A.5.5 0 0 1 16 9.07v4.286a.5.5 0 0 1-.252.434l-3.75 2.143a.5.5 0 0 1-.496 0l-3.502-2-3.502 2.001a.5.5 0 0 1-.496 0l-3.75-2.143A.5.5 0 0 1 0 13.357V9.071a.5.5 0 0 1 .252-.434L3.75 6.638V2.643a.5.5 0 0 1 .252-.434zM4.25 7.504 1.508 9.071l2.742 1.567 2.742-1.567zM7.5 9.933l-2.75 1.571v3.134l2.75-1.571zm1 3.134 2.75 1.571v-3.134L8.5 9.933zm.508-3.996 2.742 1.567 2.742-1.567-2.742-1.567zm2.242-2.433V3.504L8.5 5.076V8.21zM7.5 8.21V5.076L4.75 3.504v3.134zM5.258 2.643 8 4.21l2.742-1.567L8 1.076zM15 9.933l-2.75 1.571v3.134L15 13.067zM3.75 14.638v-3.134L1 9.933v3.134z" />
      </svg>
    ),
    children: [
      {
        href: "/warehouse/stock/create",
        label: "คีย์ผ้าเข้าสต็อก",
        menuKey: "warehouse.fabric-in",
      },
      {
        href: "/warehouse/stock/scan",
        label: "สแกนรูปคีย์ผ้าเข้าสต็อก",
        menuKey: "warehouse.fabric-in-scan",
      },
      {
        href: "/warehouse/fabric-in/review",
        label: "ตรวจสอบคีย์ผ้า",
        menuKey: "warehouse.fabric-review",
      },
      {
        href: "/warehouse/stock/purchase",
        label: "คีย์ผ้าซื้อเข้า",
        menuKey: "warehouse.purchase",
      },
      {
        href: "/warehouse/stock/purchase/review",
        label: "ตรวจสอบผ้าซื้อเข้า",
        menuKey: "warehouse.purchase-review",
      },
      {
        href: "/warehouse/bill/create",
        label: "เปิดบิลผ้า",
        menuKey: "warehouse.bill-create",
      },
      {
        href: "/warehouse/bill",
        label: "พิมพ์บิลส่งของ",
        menuKey: "warehouse.bill",
      },
      {
        href: "/warehouse/orders",
        label: "ออร์เดอร์ลูกค้า",
        menuKey: "warehouse.orders",
      },
      {
        href: "/warehouse/stock",
        label: "สต็อกผ้า",
        menuKey: "warehouse.stock",
      },
      {
        href: "/warehouse/stock-deposit",
        label: "สต็อกผ้าฝากจัดเก็บ",
        menuKey: "warehouse.stock-deposit",
      },
      {
        href: "/warehouse/reports",
        label: "รายงาน",
        menuKey: "warehouse.reports",
        labelIcon: (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path d="M11 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12h.5a.5.5 0 0 1 0 1H.5a.5.5 0 0 1 0-1H1v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3h1V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7h1z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "ระบบวัตถุดิบ",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        fill="currentColor"
        viewBox="0 0 16 16"
      >
        <path d="M0 1a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1v7.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 1 11.5V4a1 1 0 0 1-1-1zm2 3v7.5A1.5 1.5 0 0 0 3.5 13h9a1.5 1.5 0 0 0 1.5-1.5V4zm13-1V1H1v2z" />
        <path d="M5 7.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5" />
      </svg>
    ),
    children: [
      {
        href: "/warehouse/material/create",
        label: "นำเข้าวัตถุดิบ",
        menuKey: "material.create",
      },
      {
        href: "/warehouse/material/history",
        label: "ประวัติการนำเข้า",
        menuKey: "material.history",
      },
      {
        href: "/warehouse/material/requisition",
        label: "เบิกวัตถุดิบภายใน",
        menuKey: "material.requisition",
      },
      {
        href: "/warehouse/material/requisition-history",
        label: "ประวัติการเบิก",
        menuKey: "material.requisition-history",
      },
      {
        href: "/warehouse/material/outside",
        label: "เบิกวัตถุดิบภายนอก",
        menuKey: "material.outside",
      },
      {
        href: "/warehouse/material/outside-history",
        label: "ประวัติเบิกภายนอก",
        menuKey: "material.outside-history",
      },
      {
        href: "/warehouse/returns",
        label: "ส่งคืนบรรจุภัณฑ์",
        menuKey: "warehouse.returns",
      },
    ],
  },
  {
    label: "ตั้งค่า",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        fill="currentColor"
        className="bi bi-gear"
        viewBox="0 0 16 16"
      >
        <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0" />
        <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z" />
      </svg>
    ),
    children: [
      { href: "/admin/users", label: "จัดการผู้ใช้", menuKey: "admin.users" },
    ],
  },
];

export default function NavLinks({
  onClose,
  allowedMenuKeys,
}: {
  onClose?: () => void;
  allowedMenuKeys: string[] | null;
}) {
  const pathname = usePathname();

  const findActiveSection = (path: string) => {
    for (const item of navItems) {
      if (
        item.children?.some(
          (c) => path === c.href || path.startsWith(c.href + "/"),
        )
      ) {
        return item.label;
      }
    }
    return null;
  };

  const [open, setOpen] = useState<string | null>(() =>
    findActiveSection(pathname),
  );

  useEffect(() => {
    const section = findActiveSection(pathname);
    if (section) setOpen(section);
  }, [pathname]);

  const allowed = (key: string) =>
    allowedMenuKeys === null || allowedMenuKeys.includes(key);

  return (
    <div className="space-y-0.5">
      {navItems.map((item) => {
        if (item.children) {
          const visibleChildren = item.children.filter((c) =>
            allowed(c.menuKey),
          );
          if (visibleChildren.length === 0) return null;

          const isChildActive = (href: string) => {
            if (pathname === href) return true;
            const hasMoreSpecific = visibleChildren.some(
              (c) =>
                c.href !== href &&
                c.href.startsWith(href) &&
                (pathname === c.href || pathname.startsWith(c.href + "/")),
            );
            return !hasMoreSpecific && pathname.startsWith(href + "/");
          };

          const isOpen = open === item.label;
          const hasActive = visibleChildren.some((c) => isChildActive(c.href));
          return (
            <div key={item.label}>
              <button
                onClick={() => setOpen(isOpen ? null : item.label)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors
                  ${hasActive ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-700 hover:text-white"}`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </span>
                <span className="text-xs opacity-60">
                  {isOpen ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      fill="currentColor"
                      className="bi bi-caret-down-fill"
                      viewBox="0 0 16 16"
                    >
                      <path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      fill="currentColor"
                      className="bi bi-caret-right-fill"
                      viewBox="0 0 16 16"
                    >
                      <path d="m12.14 8.753-5.482 4.796c-.646.566-1.658.106-1.658-.753V3.204a1 1 0 0 1 1.659-.753l5.48 4.796a1 1 0 0 1 0 1.506z" />
                    </svg>
                  )}
                </span>
              </button>
              {isOpen && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-700 pl-3">
                  {visibleChildren.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onClose}
                      className={`block px-2 py-1.5 rounded-md text-xs transition-colors
                        ${
                          isChildActive(child.href)
                            ? "bg-blue-600 text-white"
                            : "text-slate-400 hover:bg-slate-700 hover:text-white"
                        }`}
                    >
                      <span className="flex items-center gap-1">
                        {child.labelIcon && <span>{child.labelIcon}</span>}
                        {child.label}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        }
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href!}
            onClick={onClose}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
              ${isActive ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-700 hover:text-white"}`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
