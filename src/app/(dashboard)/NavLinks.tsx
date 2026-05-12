"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = {
  href?: string;
  label: string;
  icon: React.ReactNode;
  children?: { href: string; label: string; labelIcon?: React.ReactNode }[];
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
      { href: "/sales/customers", label: "ข้อมูลลูกค้า" },
      { href: "/sales/suppliers", label: "ข้อมูลซัพพลายเออร์" },
      { href: "/sales/orders/create", label: "ใบสั่งขาย" },
      { href: "/sales/orders/review", label: "ตรวจสอบใบสั่งขาย" },
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
      { href: "/warehouse/stock/create", label: "คีย์ผ้าเข้าสต็อก" },
      { href: "/warehouse/stock/scan", label: "สแกนรูปคีย์ผ้าเข้าสต็อก" },
      { href: "/warehouse/fabric-in/review", label: "ตรวจสอบคีย์ผ้า" },
      { href: "/warehouse/stock/purchase", label: "คีย์ผ้าซื้อเข้า" },
      { href: "/warehouse/stock/purchase/review", label: "ตรวจสอบผ้าซื้อเข้า" },
      { href: "/warehouse/bill/create", label: "เปิดบิลผ้า" },
      { href: "/warehouse/bill", label: "พิมพ์บิลส่งของ" },
      { href: "/warehouse/orders", label: "ออร์เดอร์ลูกค้า" },
      { href: "/warehouse/stock", label: "สต็อกผ้า" },
      { href: "/warehouse/stock-deposit", label: "สต็อกผ้าฝากจัดเก็บ" },
      {
        href: "/warehouse/reports",
        label: "รายงาน",
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
];

export default function NavLinks() {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>("ระบบคลังสินค้า");

  return (
    <div className="space-y-0.5">
      {navItems.map((item) => {
        if (item.children) {
          const isOpen = open === item.label;
          const hasActive = item.children.some((c) =>
            pathname.startsWith(c.href),
          );
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
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`block px-2 py-1.5 rounded-md text-xs transition-colors
                        ${
                          pathname === child.href
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
