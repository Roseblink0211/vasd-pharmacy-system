import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";

import {
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  EyeOutlined,
  FileAddOutlined,
  MedicineBoxOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  UserOutlined,
} from "@ant-design/icons";

import dayjs from "dayjs";
import type { Dayjs } from "dayjs";

import api from "../api/api";

const { Title, Text } = Typography;

/* =========================================================
   TYPES
========================================================= */

interface Warehouse {
  id: number;
  warehouse_code?: string;
  code?: string;
  name: string;
  warehouse_type?: string;
  type?: string;
  is_active?: boolean;
}

interface SaleMedicine {
  id: number;
  medicine_code?: string;
  name?: string;
  active_ingredient?: string | null;
  strength?: string | null;
  dosage_form?: string | null;
  unit?: string | null;
  selling_price?: number | string | null;
  available_quantity?: number | string;
  can_sell?: boolean;
}

interface UserInfo {
  id?: number;
  full_name?: string;
  email?: string;
}

interface SalesCustomer {
  id: number;
  full_name: string;
  phone: string;
  birth_date?: string | null;
  age?: number | null;
  address?: string | null;
  order_count?: number | string;
  last_order_at?: string | null;
}

interface CustomerProfileFormValues {
  full_name: string;
  birth_date?: Dayjs;
  address?: string;
}

interface CustomerPurchaseOrder {
  id: number;
  sale_code?: string | null;
  public_id?: string | null;
  status?: string | null;
  paid_at?: string | null;
  created_at?: string | null;

  warehouse?: {
    id?: number;
    warehouse_code?: string;
    name?: string;
  };

  item_count?: number | string;
  total_quantity?: number | string;
  total_amount?: number | string;

  items?: Array<{
    id?: number;
    medicine_id?: number;
    medicine_code?: string;
    medicine_name?: string;
    active_ingredient?: string | null;
    strength?: string | null;
    unit?: string | null;
    quantity?: number | string;
    unit_price?: number | string;
    line_total?: number | string;
  }>;
}

interface CustomerHistorySummary {
  paid_order_count?: number | string;
  total_spent?: number | string;
  last_purchase_at?: string | null;
}

interface SalesOrderItem {
  id: number;
  medicine_id?: number;
  quantity: number | string;
  unit_price: number | string;
  line_total?: number | string;
  available_quantity?: number | string;

  medicine?: {
    id?: number;
    medicine_code?: string;
    name?: string;
    active_ingredient?: string | null;
    strength?: string | null;
    dosage_form?: string | null;
    unit?: string | null;
  };
}

interface SalesAllocation {
  id: number;
  sale_item_id?: number;
  batch_id?: number;
  lot_number?: string;
  expiry_date?: string | null;
  quantity: number | string;

  medicine?: {
    id?: number;
    medicine_code?: string;
    name?: string;
    unit?: string | null;
  };
}

interface StockReservationRef {
  id?: number;
  reference_type?: string;
  reference_id?: number;
  warehouse_id?: number;
  batch_id?: number;
  quantity?: number | string;
  status?: string;
}

interface SalesOrder {
  id: number;
  sale_code?: string | null;
  public_id?: string | null;
  status?: string | null;
  status_label?: string | null;
  legacy_status?: string | null;

  warehouse?: {
    id?: number;
    warehouse_code?: string;
    name?: string;
    warehouse_type?: string;
  };

  customer_name?: string | null;
  customer_phone?: string | null;
  note?: string | null;

  item_count?: number | string;
  total_quantity?: number | string;
  total_amount?: number | string;

  created_by?: UserInfo | null;
  created_at?: string | null;
  updated_at?: string | null;

  paid_by?: UserInfo | null;
  paid_at?: string | null;

  items?: SalesOrderItem[];
  allocations?: SalesAllocation[];
}

interface HeaderFormValues {
  warehouse_id: number;
  customer_name?: string;
  customer_phone?: string;
  customer_birth_date?: Dayjs;
  customer_address?: string;
  note?: string;
}

interface ItemFormValues {
  medicine_id: number;
  quantity: number;
}

interface PriceFormValues {
  medicine_id: number;
  selling_price: number;
}

/* =========================================================
   HELPERS
========================================================= */

function normalizeArray<T>(data: unknown, keys: string[]): T[] {
  if (Array.isArray(data)) {
    return data as T[];
  }

  if (typeof data !== "object" || data === null) {
    return [];
  }

  const value = data as Record<string, unknown>;

  for (const key of keys) {
    if (Array.isArray(value[key])) {
      return value[key] as T[];
    }
  }

  return [];
}

function formatMoney(value?: number | string | null) {
  const number = Number(value ?? 0);

  return `${new Intl.NumberFormat("vi-VN").format(number)} đ`;
}

function formatNumber(value?: number | string | null) {
  return new Intl.NumberFormat("vi-VN").format(Number(value ?? 0));
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = dayjs(value);
  return date.isValid() ? date.format("DD/MM/YYYY HH:mm") : value;
}

function calculateAge(
  value?: string | Dayjs | null,
) {
  if (!value) {
    return null;
  }

  const birthDate = dayjs(value);

  if (
    !birthDate.isValid() ||
    birthDate.isAfter(dayjs(), "day")
  ) {
    return null;
  }

  return dayjs().diff(
    birthDate,
    "year",
  );
}

function formatBirthDate(
  value?: string | null,
) {
  if (!value) {
    return "-";
  }

  const date = dayjs(value);

  return date.isValid()
    ? date.format("DD/MM/YYYY")
    : value;
}

function getUserLabel(user?: UserInfo | null) {
  if (!user) {
    return "-";
  }

  return user.full_name || user.email || (user.id ? `#${user.id}` : "-");
}

function getStatusLabel(status?: string | null) {
  if (status === "UNPAID") {
    return "Chưa thanh toán";
  }

  if (status === "PAID") {
    return "Đã thanh toán";
  }

  return status || "-";
}

function getStatusColor(status?: string | null) {
  if (status === "UNPAID") {
    return "orange";
  }

  if (status === "PAID") {
    return "green";
  }

  return "default";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function extractPublicId(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const uuidMatch = normalized.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );

  return uuidMatch?.[0] || null;
}

/* =========================================================
   COMPONENT
========================================================= */

function Sales() {
  const [headerForm] = Form.useForm<HeaderFormValues>();
  const [itemForm] = Form.useForm<ItemFormValues>();
  const [priceForm] = Form.useForm<PriceFormValues>();
  const [customerProfileForm] =
    Form.useForm<CustomerProfileFormValues>();

  const watchedWarehouseId = Form.useWatch("warehouse_id", headerForm);
  const watchedCustomerPhone = Form.useWatch("customer_phone", headerForm);
  const watchedCustomerBirthDate = Form.useWatch(
    "customer_birth_date",
    headerForm,
  );

  const watchedMedicineId = Form.useWatch("medicine_id", itemForm);
  const watchedQuantity = Form.useWatch("quantity", itemForm);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [saleMedicines, setSaleMedicines] = useState<SaleMedicine[]>([]);
  const [customers, setCustomers] = useState<SalesCustomer[]>([]);

  const [customerLookupLoading, setCustomerLookupLoading] =
    useState(false);

  const [
    customerLookupStatus,
    setCustomerLookupStatus,
  ] = useState<"idle" | "found" | "not_found">("idle");

  const [
    customerProfileModalOpen,
    setCustomerProfileModalOpen,
  ] = useState(false);

  const [
    customerProfileMode,
    setCustomerProfileMode,
  ] = useState<"create" | "edit">("create");

  const [
    customerProfileSaving,
    setCustomerProfileSaving,
  ] = useState(false);

  const [
    customerPurchaseHistory,
    setCustomerPurchaseHistory,
  ] = useState<CustomerPurchaseOrder[]>([]);

  const [
    customerHistorySummary,
    setCustomerHistorySummary,
  ] = useState<CustomerHistorySummary | null>(null);

  const [
    customerHistoryLoading,
    setCustomerHistoryLoading,
  ] = useState(false);

  const [masterLoading, setMasterLoading] = useState(false);

  const [currentOrder, setCurrentOrder] = useState<SalesOrder | null>(null);
  const [items, setItems] = useState<SalesOrderItem[]>([]);
  const [allocations, setAllocations] = useState<SalesAllocation[]>([]);

  const [savingHeader, setSavingHeader] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [paying, setPaying] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);

  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState<string | undefined>();

  const [historyBatchMap, setHistoryBatchMap] =
    useState<Record<number, number[]>>({});

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOrder, setDetailOrder] = useState<SalesOrder | null>(null);

  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);

  const [lookupModalOpen, setLookupModalOpen] = useState(false);
  const [lookupValue, setLookupValue] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  /* POS workspace */
  const [quickMedicineSearch, setQuickMedicineSearch] = useState("");

  /* =========================================================
     DERIVED
  ========================================================= */

  const saleWarehouses = useMemo(
    () =>
      warehouses.filter(
        (warehouse) =>
          (warehouse.warehouse_type || warehouse.type) === "SALE",
      ),
    [warehouses],
  );

  const currentEditable = currentOrder?.status === "UNPAID";

  const selectedMedicine = useMemo(
    () =>
      saleMedicines.find(
        (medicine) => medicine.id === watchedMedicineId,
      ),
    [saleMedicines, watchedMedicineId],
  );

  const selectedQuantity = Number(watchedQuantity || 1);

  const selectedLineTotal =
    Number(selectedMedicine?.selling_price || 0) *
    (Number.isFinite(selectedQuantity) ? selectedQuantity : 0);

  const totalQuantity = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0,
      ),
    [items],
  );

  const totalAmount = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum +
          Number(item.quantity || 0) *
            Number(item.unit_price || 0),
        0,
      ),
    [items],
  );

  const existingMedicineIds = useMemo(
    () =>
      new Set(
        items
          .filter((item) => item.id !== editingItemId)
          .map((item) => item.medicine?.id ?? item.medicine_id)
          .filter((value): value is number => typeof value === "number"),
      ),
    [items, editingItemId],
  );

  /*
   * Thuốc đang có tồn tại Kho bán.
   *
   * Không lọc theo giá bán ở đây để người dùng vẫn nhìn thấy
   * thuốc đang có trong kho nhưng chưa được cấu hình giá.
   */
  const availableMedicines = useMemo(
    () =>
      saleMedicines.filter(
        (medicine) =>
          Number(medicine.available_quantity || 0) > 0,
      ),
    [saleMedicines],
  );

  /*
   * Thuốc thực sự đủ điều kiện bán:
   * - backend xác nhận can_sell
   * - còn tồn khả dụng
   * - đã có giá bán
   */
  const sellableMedicines = useMemo(
    () =>
      availableMedicines.filter(
        (medicine) =>
          medicine.can_sell === true &&
          Number(medicine.selling_price || 0) > 0,
      ),
    [availableMedicines],
  );

  /*
   * Khu vực bán nhanh hiển thị toàn bộ thuốc đang có tồn.
   *
   * Nếu chưa có giá hoặc backend đánh dấu chưa bán được,
   * card vẫn hiển thị nhưng nút thêm vào giỏ sẽ bị khóa.
   */
  const quickMedicines = useMemo(() => {
    const keyword = quickMedicineSearch
      .trim()
      .toLocaleLowerCase("vi-VN");

    return availableMedicines
      .filter((medicine) => {
        if (
          existingMedicineIds.has(medicine.id) ||
          editingItemId !== null
        ) {
          return false;
        }

        if (!keyword) {
          return true;
        }

        return [
          medicine.medicine_code,
          medicine.name,
          medicine.active_ingredient,
          medicine.strength,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value)
              .toLocaleLowerCase("vi-VN")
              .includes(keyword),
          );
      })
      .slice(0, 8);
  }, [
    availableMedicines,
    quickMedicineSearch,
    existingMedicineIds,
    editingItemId,
  ]);

  const totalAvailableStock = useMemo(
    () =>
      availableMedicines.reduce(
        (sum, medicine) =>
          sum + Number(medicine.available_quantity || 0),
        0,
      ),
    [availableMedicines],
  );

  const todayOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.created_at &&
          dayjs(order.created_at).isSame(dayjs(), "day"),
      ),
    [orders],
  );

  const todayPaidOrders = useMemo(
    () =>
      todayOrders.filter(
        (order) => order.status === "PAID",
      ),
    [todayOrders],
  );

  const todayRevenue = useMemo(
    () =>
      todayPaidOrders.reduce(
        (sum, order) =>
          sum + Number(order.total_amount || 0),
        0,
      ),
    [todayPaidOrders],
  );

  const unpaidOrderCount = useMemo(
    () =>
      orders.filter(
        (order) => order.status === "UNPAID",
      ).length,
    [orders],
  );

  const currentCustomer = useMemo(() => {
    const phone =
      String(
        watchedCustomerPhone || "",
      ).replace(/\D/g, "");

    if (!/^0\d{9}$/.test(phone)) {
      return null;
    }

    return (
      customers.find(
        (customer) =>
          customer.phone === phone,
      ) || null
    );
  }, [
    customers,
    watchedCustomerPhone,
  ]);

  const watchedCustomerAge = useMemo(
    () =>
      calculateAge(
        watchedCustomerBirthDate,
      ),
    [watchedCustomerBirthDate],
  );

  const detailCustomer = useMemo(() => {
    if (!detailOrder?.customer_phone) {
      return null;
    }

    return (
      customers.find(
        (customer) =>
          customer.phone ===
          detailOrder.customer_phone,
      ) || null
    );
  }, [
    customers,
    detailOrder?.customer_phone,
  ]);

  /* =========================================================
     LOAD WAREHOUSES
  ========================================================= */

  const loadWarehouses = async () => {
    try {
      setMasterLoading(true);

      const response = await api.get("/warehouses", {
        params: {
          is_active: true,
        },
      });

      const data = normalizeArray<Warehouse>(response.data, [
        "data",
        "warehouses",
      ]);

      setWarehouses(data);

      const availableSaleWarehouses = data.filter(
        (warehouse) =>
          (warehouse.warehouse_type || warehouse.type) === "SALE",
      );

      if (
        !headerForm.getFieldValue("warehouse_id") &&
        availableSaleWarehouses.length === 1
      ) {
        headerForm.setFieldValue(
          "warehouse_id",
          availableSaleWarehouses[0].id,
        );
      }
    } catch (error) {
      console.error("Load sale warehouses:", error);
      message.error("Không thể tải danh sách kho");
    } finally {
      setMasterLoading(false);
    }
  };

  /* =========================================================
     LOAD POS MEDICINES
  ========================================================= */

  const loadSaleMedicines = async (
    warehouseId?: number,
  ) => {
    if (!warehouseId) {
      setSaleMedicines([]);
      return;
    }

    try {
      setMasterLoading(true);

      const response = await api.get(
        "/sales-orders/medicines",
        {
          params: {
            warehouse_id: warehouseId,
          },
        },
      );

      if (response.data?.success !== true) {
        message.error(
          response.data?.message ||
            "Không thể tải thuốc bán",
        );
        setSaleMedicines([]);
        return;
      }

      setSaleMedicines(
        normalizeArray<SaleMedicine>(response.data, [
          "data",
          "medicines",
        ]),
      );
    } catch (error) {
      console.error("Load sale medicines:", error);
      message.error("Không thể tải danh sách thuốc bán");
      setSaleMedicines([]);
    } finally {
      setMasterLoading(false);
    }
  };

  /* =========================================================
     CUSTOMER / PATIENT - PHONE FIRST
  ========================================================= */

  const normalizePhone = (
    value?: string | null,
  ) =>
    String(value || "")
      .replace(/\D/g, "")
      .slice(0, 10);

  const mergeCustomerIntoDirectory = (
    customer: SalesCustomer,
  ) => {
    setCustomers((current) => {
      const next = current.filter(
        (item) =>
          item.phone !== customer.phone,
      );

      return [
        customer,
        ...next,
      ];
    });
  };

  const loadCustomerDirectory = async () => {
    try {
      const response = await api.get(
        "/sales-customers",
      );

      if (response.data?.success !== true) {
        setCustomers([]);
        return;
      }

      setCustomers(
        normalizeArray<SalesCustomer>(
          response.data,
          [
            "data",
            "customers",
          ],
        ),
      );
    } catch (error) {
      console.error(
        "Load customer directory:",
        error,
      );

      setCustomers([]);
    }
  };

  const clearCustomerProfile = (
    keepPhone = true,
  ) => {
    const phone = keepPhone
      ? normalizePhone(
          headerForm.getFieldValue(
            "customer_phone",
          ),
        )
      : "";

    headerForm.setFieldsValue({
      customer_phone:
        phone || undefined,

      customer_name:
        undefined,

      customer_birth_date:
        undefined,

      customer_address:
        undefined,
    });

    setCustomerPurchaseHistory([]);
    setCustomerHistorySummary(null);
  };

  const loadCustomerPurchaseHistory = async (
    phone: string,
  ) => {
    const normalized =
      normalizePhone(phone);

    if (!/^0\d{9}$/.test(normalized)) {
      setCustomerPurchaseHistory([]);
      setCustomerHistorySummary(null);
      return;
    }

    try {
      setCustomerHistoryLoading(true);

      const response = await api.get(
        `/sales-customers/by-phone/${normalized}/purchase-history`,
        {
          params: {
            limit: 50,
          },
        },
      );

      if (
        response.data?.success !== true ||
        response.data?.found !== true
      ) {
        setCustomerPurchaseHistory([]);
        setCustomerHistorySummary(null);
        return;
      }

      setCustomerPurchaseHistory(
        normalizeArray<CustomerPurchaseOrder>(
          response.data,
          ["orders"],
        ),
      );

      setCustomerHistorySummary(
        (response.data?.summary ||
          null) as CustomerHistorySummary | null,
      );
    } catch (error) {
      console.error(
        "Load customer purchase history:",
        error,
      );

      setCustomerPurchaseHistory([]);
      setCustomerHistorySummary(null);
    } finally {
      setCustomerHistoryLoading(false);
    }
  };

  const lookupCustomerByPhone = async (
    rawPhone: string,
    showMessage = true,
  ) => {
    const phone =
      normalizePhone(rawPhone);

    headerForm.setFieldValue(
      "customer_phone",
      phone || undefined,
    );

    if (!/^0\d{9}$/.test(phone)) {
      setCustomerLookupStatus("idle");
      clearCustomerProfile(true);

      if (showMessage && phone) {
        message.warning(
          "SĐT phải gồm 10 chữ số và bắt đầu bằng 0",
        );
      }

      return null;
    }

    try {
      setCustomerLookupLoading(true);

      const response = await api.get(
        `/sales-customers/by-phone/${phone}`,
      );

      if (response.data?.success !== true) {
        message.error(
          response.data?.message ||
            "Không thể tra cứu khách hàng",
        );

        return null;
      }

      if (response.data?.found !== true) {
        clearCustomerProfile(true);
        setCustomerLookupStatus(
          "not_found",
        );

        if (showMessage) {
          message.info(
            "SĐT chưa có hồ sơ khách hàng",
          );
        }

        return null;
      }

      const customer =
        response.data
          ?.customer as SalesCustomer;

      mergeCustomerIntoDirectory(
        customer,
      );

      setCustomerLookupStatus("found");

      headerForm.setFieldsValue({
        customer_phone:
          customer.phone,

        customer_name:
          customer.full_name,

        customer_birth_date:
          customer.birth_date
            ? dayjs(
                customer.birth_date,
              )
            : undefined,

        customer_address:
          customer.address ||
          undefined,
      });

      await loadCustomerPurchaseHistory(
        customer.phone,
      );

      return customer;

    } catch (error) {
      console.error(
        "Lookup customer by phone:",
        error,
      );

      message.error(
        "Có lỗi khi tra cứu khách hàng",
      );

      return null;

    } finally {
      setCustomerLookupLoading(false);
    }
  };

  const openCreateCustomerProfile = () => {
    const phone =
      normalizePhone(
        headerForm.getFieldValue(
          "customer_phone",
        ),
      );

    if (!/^0\d{9}$/.test(phone)) {
      message.warning(
        "Hãy nhập SĐT hợp lệ trước",
      );
      return;
    }

    setCustomerProfileMode("create");

    customerProfileForm.resetFields();

    setCustomerProfileModalOpen(true);
  };

  const openEditCustomerProfile = () => {
    if (!currentCustomer) {
      return;
    }

    setCustomerProfileMode("edit");

    customerProfileForm.setFieldsValue({
      full_name:
        currentCustomer.full_name,

      birth_date:
        currentCustomer.birth_date
          ? dayjs(
              currentCustomer.birth_date,
            )
          : undefined,

      address:
        currentCustomer.address ||
        undefined,
    });

    setCustomerProfileModalOpen(true);
  };

  const handleSaveCustomerProfile = async (
    values: CustomerProfileFormValues,
  ) => {
    const phone =
      normalizePhone(
        headerForm.getFieldValue(
          "customer_phone",
        ),
      );

    if (!/^0\d{9}$/.test(phone)) {
      message.warning(
        "SĐT không hợp lệ",
      );
      return;
    }

    try {
      setCustomerProfileSaving(true);

      const payload = {
        full_name:
          values.full_name
            .trim()
            .replace(/\s+/g, " "),

        birth_date:
          values.birth_date
            ? values.birth_date.format(
                "YYYY-MM-DD",
              )
            : null,

        address:
          values.address
            ?.trim()
            .replace(/\s+/g, " ") ||
          null,
      };

      const response =
        customerProfileMode === "edit" &&
        currentCustomer
          ? await api.put(
              `/sales-customers/${currentCustomer.id}`,
              payload,
            )
          : await api.post(
              "/sales-customers",
              {
                ...payload,
                phone,
              },
            );

      if (response.data?.success !== true) {
        message.error(
          response.data?.message ||
            "Không thể lưu hồ sơ khách hàng",
        );

        return;
      }

      setCustomerProfileModalOpen(false);

      customerProfileForm.resetFields();

      await loadCustomerDirectory();

      await lookupCustomerByPhone(
        phone,
        false,
      );

      message.success(
        customerProfileMode === "edit"
          ? "Đã cập nhật hồ sơ khách hàng"
          : "Đã tạo hồ sơ khách hàng",
      );

    } catch (error) {
      console.error(
        "Save customer profile:",
        error,
      );

      message.error(
        "Có lỗi khi lưu hồ sơ khách hàng",
      );

    } finally {
      setCustomerProfileSaving(false);
    }
  };

  /* =========================================================
     LOAD HISTORY
  ========================================================= */

  const loadHistoryBatchIds = async (
    orderList: SalesOrder[],
  ) => {
    try {
      /*
       * UNPAID: batch đang được giữ trong stock_reservations.
       * PAID: batch thật đã xuất nằm trong sales_order_allocations
       *       và được trả về từ /sales-orders/{id}.
       */
      let activeReservations: StockReservationRef[] = [];

      try {
        const reservationResponse = await api.get(
          "/stock-reservations",
          {
            params: {
              status: "ACTIVE",
            },
          },
        );

        activeReservations =
          normalizeArray<StockReservationRef>(
            reservationResponse.data,
            [
              "data",
              "reservations",
              "stock_reservations",
            ],
          );
      } catch (reservationError) {
        console.error(
          "Load active sale reservations:",
          reservationError,
        );
      }

      const nextMap: Record<number, number[]> = {};

      orderList.forEach((order) => {
        if (order.status !== "UNPAID") {
          return;
        }

        const ids = activeReservations
          .filter(
            (reservation) =>
              reservation.reference_type ===
                "SALES_ORDER" &&
              Number(reservation.reference_id) ===
                Number(order.id),
          )
          .map((reservation) =>
            Number(reservation.batch_id),
          )
          .filter(
            (batchId) =>
              Number.isFinite(batchId) &&
              batchId > 0,
          );

        nextMap[order.id] = Array.from(
          new Set(ids),
        );
      });

      const paidOrders = orderList.filter(
        (order) => order.status === "PAID",
      );

      const paidResults = await Promise.all(
        paidOrders.map(async (order) => {
          try {
            const response = await api.get(
              `/sales-orders/${order.id}`,
            );

            const detailAllocations =
              normalizeArray<SalesAllocation>(
                response.data,
                ["allocations"],
              );

            const ids = detailAllocations
              .map((allocation) =>
                Number(allocation.batch_id),
              )
              .filter(
                (batchId) =>
                  Number.isFinite(batchId) &&
                  batchId > 0,
              );

            return [
              order.id,
              Array.from(new Set(ids)),
            ] as const;
          } catch (error) {
            console.error(
              `Load sale allocations ${order.id}:`,
              error,
            );

            return [order.id, [] as number[]] as const;
          }
        }),
      );

      paidResults.forEach(([saleId, batchIds]) => {
        nextMap[saleId] = batchIds;
      });

      setHistoryBatchMap(nextMap);
    } catch (error) {
      console.error(
        "Load history batch IDs:",
        error,
      );

      setHistoryBatchMap({});
    }
  };

  const loadHistory = async (
    status = historyStatus,
    search = historySearch,
  ) => {
    try {
      setHistoryLoading(true);

      const response = await api.get("/sales-orders", {
        params: {
          status: status || undefined,
          search: search.trim() || undefined,
        },
      });

      if (response.data?.success !== true) {
        message.error(
          response.data?.message ||
            "Không thể tải danh sách phiếu bán",
        );
        return;
      }

      const loadedOrders =
        normalizeArray<SalesOrder>(
          response.data,
          [
            "data",
            "sales_orders",
            "orders",
          ],
        );

      setOrders(loadedOrders);

      await loadHistoryBatchIds(
        loadedOrders,
      );
    } catch (error) {
      console.error("Load sales history:", error);
      message.error("Không thể tải danh sách phiếu bán");
    } finally {
      setHistoryLoading(false);
    }
  };

  /* =========================================================
     LOAD ORDER DETAIL
  ========================================================= */

  const loadOrderDetail = async (
    saleId: number,
    options: {
      setAsCurrent?: boolean;
      openDrawer?: boolean;
    } = {},
  ) => {
    try {
      if (options.openDrawer) {
        setDrawerOpen(true);
        setDetailLoading(true);
      }

      const response = await api.get(
        `/sales-orders/${saleId}`,
      );

      if (response.data?.success !== true) {
        message.error(
          response.data?.message ||
            "Không thể tải chi tiết phiếu bán",
        );
        return null;
      }

      const rawOrder =
        response.data.sales_order ||
        response.data.sale ||
        response.data.data;

      if (!rawOrder) {
        message.error("Không tìm thấy phiếu bán");
        return null;
      }

      const detailItems = normalizeArray<SalesOrderItem>(
        response.data,
        ["items"],
      );

      const detailAllocations =
        normalizeArray<SalesAllocation>(
          response.data,
          ["allocations"],
        );

      const complete: SalesOrder = {
        ...(rawOrder as SalesOrder),
        items: detailItems,
        allocations: detailAllocations,
        item_count:
          response.data.item_count ?? detailItems.length,
        total_quantity:
          response.data.total_quantity ??
          detailItems.reduce(
            (sum, item) =>
              sum + Number(item.quantity || 0),
            0,
          ),
        total_amount:
          response.data.total_amount ??
          detailItems.reduce(
            (sum, item) =>
              sum +
              Number(item.quantity || 0) *
                Number(item.unit_price || 0),
            0,
          ),
      };

      if (options.setAsCurrent) {
        setCurrentOrder(complete);
        setItems(detailItems);
        setAllocations(detailAllocations);
        setEditingItemId(null);

        headerForm.setFieldsValue({
          warehouse_id: complete.warehouse?.id,
          customer_name:
            complete.customer_name || undefined,
          customer_phone:
            complete.customer_phone || undefined,
          note: complete.note || undefined,
        });

        itemForm.resetFields();

        if (complete.warehouse?.id) {
          await loadSaleMedicines(
            complete.warehouse.id,
          );
        }
      }

      if (options.openDrawer) {
        setDetailOrder(complete);
      }

      return complete;
    } catch (error) {
      console.error("Load order detail:", error);
      message.error("Không thể tải chi tiết phiếu bán");
      return null;
    } finally {
      if (options.openDrawer) {
        setDetailLoading(false);
      }
    }
  };

  /* =========================================================
     LOOKUP BY PUBLIC ID / QR
  ========================================================= */

  const lookupSaleByPublicId = async (
    rawValue: string,
  ) => {
    const publicId = extractPublicId(rawValue);

    if (!publicId) {
      message.warning(
        "Mã tra cứu không hợp lệ. Hãy nhập UUID hoặc quét QR của phiếu bán.",
      );
      return;
    }

    try {
      setLookupLoading(true);

      const response = await api.get(
        `/sales-orders/lookup/${publicId}`,
      );

      if (response.data?.success !== true) {
        message.error(
          response.data?.message ||
            "Không tìm thấy phiếu bán",
        );
        return;
      }

      const rawOrder =
        response.data.sales_order ||
        response.data.sale ||
        response.data.data;

      if (!rawOrder) {
        message.error(
          "Backend không trả về thông tin phiếu bán",
        );
        return;
      }

      const detailItems =
        normalizeArray<SalesOrderItem>(
          response.data,
          ["items"],
        );

      const detailAllocations =
        normalizeArray<SalesAllocation>(
          response.data,
          ["allocations"],
        );

      const complete: SalesOrder = {
        ...(rawOrder as SalesOrder),
        items: detailItems,
        allocations: detailAllocations,
        item_count:
          response.data.item_count ??
          detailItems.length,
        total_quantity:
          response.data.total_quantity ??
          detailItems.reduce(
            (sum, item) =>
              sum + Number(item.quantity || 0),
            0,
          ),
        total_amount:
          response.data.total_amount ??
          detailItems.reduce(
            (sum, item) =>
              sum +
              Number(item.quantity || 0) *
                Number(item.unit_price || 0),
            0,
          ),
      };

      setLookupValue(publicId);
      setDetailOrder(complete);
      setDrawerOpen(true);
      setLookupModalOpen(false);

      const url = new URL(window.location.href);
      url.pathname = "/sales";
      url.searchParams.set("lookup", publicId);

      window.history.replaceState(
        {},
        "",
        `${url.pathname}${url.search}`,
      );

      message.success(
        `Đã tra cứu phiếu ${
          complete.sale_code || ""
        }`,
      );
    } catch (error) {
      console.error("Lookup sale order:", error);
      message.error(
        "Có lỗi khi tra cứu phiếu bán",
      );
    } finally {
      setLookupLoading(false);
    }
  };

  const openLookupModal = (
    publicId?: string | null,
  ) => {
    setLookupValue(publicId || "");
    setLookupModalOpen(true);
  };

  /* =========================================================
     INITIAL
  ========================================================= */

  useEffect(() => {
    void loadWarehouses();
    void loadHistory();
    void loadCustomerDirectory();

    const params = new URLSearchParams(
      window.location.search,
    );

    const lookup = params.get("lookup");

    if (lookup) {
      setLookupValue(lookup);
      void lookupSaleByPublicId(lookup);
    }
  }, []);

  useEffect(() => {
    if (!watchedWarehouseId) {
      setSaleMedicines([]);
      return;
    }

    void loadSaleMedicines(watchedWarehouseId);

    if (!editingItemId) {
      itemForm.resetFields();
    }
  }, [watchedWarehouseId]);

  useEffect(() => {
    if (!currentOrder?.customer_phone) {
      setCustomerLookupStatus("idle");
      setCustomerPurchaseHistory([]);
      setCustomerHistorySummary(null);
      return;
    }

    void lookupCustomerByPhone(
      currentOrder.customer_phone,
      false,
    );
  }, [
    currentOrder?.id,
    currentOrder?.customer_phone,
  ]);

  useEffect(() => {
    if (!watchedMedicineId || editingItemId !== null) {
      return;
    }

    itemForm.setFieldValue("quantity", 1);
  }, [watchedMedicineId, editingItemId, itemForm]);

  /* =========================================================
     HEADER
  ========================================================= */

  const handleSaveHeader = async (
    values: HeaderFormValues,
  ) => {
    const customerName =
      values.customer_name?.trim() || "";

    const customerPhone =
      values.customer_phone?.trim() || "";

    if (Boolean(customerName) !== Boolean(customerPhone)) {
      message.warning(
        "Khách có thông tin phải nhập đầy đủ cả tên và số điện thoại",
      );
      return;
    }

    try {
      setSavingHeader(true);

      const payload = {
        warehouse_id: values.warehouse_id,
        customer_name:
          customerName || null,
        customer_phone:
          customerPhone || null,
        customer_birth_date:
          values.customer_birth_date
            ? values.customer_birth_date.format(
                "YYYY-MM-DD",
              )
            : null,
        customer_address:
          values.customer_address
            ?.trim()
            .replace(/\s+/g, " ") ||
          null,
        note: values.note?.trim() || null,
      };

      if (!currentOrder) {
        const response = await api.post(
          "/sales-orders",
          payload,
        );

        if (response.data?.success !== true) {
          message.error(
            response.data?.message ||
              "Không thể tạo phiếu bán",
          );
          return;
        }

        const saleId = Number(response.data.sale_id);

        if (!saleId) {
          message.error(
            "Backend không trả về ID phiếu bán",
          );
          return;
        }

        await loadOrderDetail(saleId, {
          setAsCurrent: true,
        });

        await loadHistory();
        await loadCustomerDirectory();

        message.success(
          "Đã tạo phiếu bán - trạng thái Chưa thanh toán",
        );
        return;
      }

      if (!currentEditable) {
        message.warning(
          "Phiếu đã thanh toán nên không thể chỉnh sửa",
        );
        return;
      }

      const response = await api.put(
        `/sales-orders/${currentOrder.id}`,
        payload,
      );

      if (response.data?.success !== true) {
        message.error(
          response.data?.message ||
            "Không thể cập nhật phiếu bán",
        );
        return;
      }

      await loadOrderDetail(currentOrder.id, {
        setAsCurrent: true,
      });

      await loadHistory();
      await loadCustomerDirectory();

      message.success("Đã cập nhật phiếu bán");
    } catch (error) {
      console.error("Save sales header:", error);
      message.error("Có lỗi khi lưu phiếu bán");
    } finally {
      setSavingHeader(false);
    }
  };

  const handleNewOrder = () => {
    setCurrentOrder(null);
    setItems([]);
    setAllocations([]);
    setEditingItemId(null);
    setQuickMedicineSearch("");
    setCustomerLookupStatus("idle");
    setCustomerPurchaseHistory([]);
    setCustomerHistorySummary(null);

    headerForm.resetFields();
    itemForm.resetFields();

    if (saleWarehouses.length === 1) {
      headerForm.setFieldValue(
        "warehouse_id",
        saleWarehouses[0].id,
      );
    }
  };

  /* =========================================================
     ITEMS
  ========================================================= */

  const handleEditItem = (item: SalesOrderItem) => {
    if (!currentEditable) {
      return;
    }

    setEditingItemId(item.id);

    itemForm.setFieldsValue({
      medicine_id:
        item.medicine?.id ?? item.medicine_id ?? 0,
      quantity: Number(item.quantity),
    });
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    itemForm.resetFields();
  };

  const handleSaveItem = async (
    values: ItemFormValues,
  ) => {
    if (!currentOrder) {
      message.warning("Hãy tạo phiếu bán trước");
      return;
    }

    if (!currentEditable) {
      message.warning(
        "Phiếu đã thanh toán nên không thể chỉnh sửa",
      );
      return;
    }

    const medicine = saleMedicines.find(
      (item) => item.id === values.medicine_id,
    );

    if (!medicine) {
      message.warning("Không tìm thấy thuốc");
      return;
    }

    const quantity = Number(values.quantity);
    const available = Number(
      medicine.available_quantity || 0,
    );

    if (!Number.isInteger(quantity) || quantity <= 0) {
      message.warning(
        "Số lượng phải là số nguyên lớn hơn 0",
      );
      return;
    }

    if (!medicine.selling_price) {
      message.warning(
        "Thuốc chưa được cấu hình giá bán",
      );
      return;
    }

    if (quantity > available) {
      message.warning(
        `Số lượng vượt tồn khả dụng. Hiện còn ${formatNumber(
          available,
        )} ${medicine.unit || ""}`,
      );
      return;
    }

    try {
      setSavingItem(true);

      const payload = {
        medicine_id: values.medicine_id,
        quantity,
      };

      const response =
        editingItemId === null
          ? await api.post(
              `/sales-orders/${currentOrder.id}/items`,
              payload,
            )
          : await api.put(
              `/sales-orders/${currentOrder.id}/items/${editingItemId}`,
              payload,
            );

      if (response.data?.success !== true) {
        message.error(
          response.data?.message ||
            "Không thể lưu thuốc",
        );
        return;
      }

      await loadOrderDetail(currentOrder.id, {
        setAsCurrent: true,
      });

      await loadHistory();

      setEditingItemId(null);
      itemForm.resetFields();

      message.success(
        editingItemId === null
          ? "Đã thêm thuốc vào phiếu"
          : "Đã cập nhật thuốc",
      );
    } catch (error) {
      console.error("Save sale item:", error);
      message.error("Có lỗi khi lưu thuốc");
    } finally {
      setSavingItem(false);
    }
  };

  const handleQuickAddMedicine = async (
    medicine: SaleMedicine,
  ) => {
    if (!currentOrder) {
      message.warning("Hãy tạo phiếu bán trước");
      return;
    }

    if (!currentEditable) {
      message.warning(
        "Phiếu đã thanh toán nên không thể thêm thuốc",
      );
      return;
    }

    if (editingItemId !== null) {
      message.warning(
        "Hãy hoàn tất hoặc hủy chỉnh sửa thuốc hiện tại trước",
      );
      return;
    }

    if (existingMedicineIds.has(medicine.id)) {
      message.info(
        "Thuốc này đã có trong giỏ. Hãy sửa số lượng ngay trên dòng thuốc.",
      );
      return;
    }

    await handleSaveItem({
      medicine_id: medicine.id,
      quantity: 1,
    });
  };

  const handleDeleteItem = async (
    itemId: number,
  ) => {
    if (!currentOrder || !currentEditable) {
      return;
    }

    try {
      const response = await api.delete(
        `/sales-orders/${currentOrder.id}/items/${itemId}`,
      );

      if (response.data?.success !== true) {
        message.error(
          response.data?.message ||
            "Không thể xóa thuốc",
        );
        return;
      }

      await loadOrderDetail(currentOrder.id, {
        setAsCurrent: true,
      });

      await loadHistory();

      message.success("Đã xóa thuốc khỏi phiếu");
    } catch (error) {
      console.error("Delete sale item:", error);
      message.error("Có lỗi khi xóa thuốc");
    }
  };

  /* =========================================================
     PAYMENT
  ========================================================= */

  const handlePay = async () => {
    if (!currentOrder) {
      return;
    }

    if (currentOrder.status !== "UNPAID") {
      message.warning("Phiếu này đã thanh toán");
      return;
    }

    if (items.length === 0) {
      message.warning(
        "Phiếu chưa có thuốc để thanh toán",
      );
      return;
    }

    try {
      setPaying(true);

      const response = await api.post(
        `/sales-orders/${currentOrder.id}/pay`,
      );

      if (response.data?.success !== true) {
        message.error(
          response.data?.message ||
            "Thanh toán thất bại",
        );
        return;
      }

      await loadOrderDetail(currentOrder.id, {
        setAsCurrent: true,
      });

      await loadHistory();

      if (currentOrder.customer_phone) {
        await loadCustomerPurchaseHistory(
          currentOrder.customer_phone,
        );
      }

      await loadSaleMedicines(
        currentOrder.warehouse?.id ||
          watchedWarehouseId,
      );

      message.success(
        "Thanh toán thành công - tồn kho đã được trừ theo FEFO",
      );
    } catch (error) {
      console.error("Pay sale order:", error);
      message.error("Có lỗi khi thanh toán");
    } finally {
      setPaying(false);
    }
  };

  /* =========================================================
     SELLING PRICE
  ========================================================= */

  const openPriceModal = (
    medicine?: SaleMedicine,
  ) => {
    setPriceModalOpen(true);

    if (medicine) {
      priceForm.setFieldsValue({
        medicine_id: medicine.id,
        selling_price: Number(
          medicine.selling_price || 0,
        ),
      });
    } else {
      priceForm.resetFields();
    }
  };

  const handleSavePrice = async (
    values: PriceFormValues,
  ) => {
    const sellingPrice = Number(
      values.selling_price,
    );

    if (
      !Number.isInteger(sellingPrice) ||
      sellingPrice <= 0
    ) {
      message.warning(
        "Giá bán phải là số nguyên lớn hơn 0",
      );
      return;
    }

    try {
      setSavingPrice(true);

      const response = await api.put(
        `/medicines/${values.medicine_id}/selling-price`,
        {
          selling_price: sellingPrice,
        },
      );

      if (response.data?.success !== true) {
        message.error(
          response.data?.message ||
            "Không thể cập nhật giá bán",
        );
        return;
      }

      setPriceModalOpen(false);
      priceForm.resetFields();

      if (watchedWarehouseId) {
        await loadSaleMedicines(
          watchedWarehouseId,
        );
      }

      message.success("Đã cập nhật giá bán");
    } catch (error) {
      console.error("Save selling price:", error);
      message.error("Có lỗi khi cập nhật giá bán");
    } finally {
      setSavingPrice(false);
    }
  };

  /* =========================================================
     PRINT
  ========================================================= */

  const handlePrint = (order: SalesOrder) => {
    const printCustomer =
      order.customer_phone
        ? customers.find(
            (customer) =>
              customer.phone ===
              order.customer_phone,
          ) || null
        : null;

    if (order.status !== "PAID") {
      message.warning(
        "Chỉ phiếu Đã thanh toán mới được in",
      );
      return;
    }

    const printWindow = window.open(
      "",
      "_blank",
      "width=900,height=900",
    );

    if (!printWindow) {
      message.error(
        "Trình duyệt đang chặn cửa sổ in",
      );
      return;
    }

    const orderItems = order.items || [];

    const itemRows = orderItems
      .map(
        (item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>
              <strong>${escapeHtml(
                item.medicine?.name || "-",
              )}</strong>
              <div class="muted">${escapeHtml(
                item.medicine?.medicine_code || "",
              )}</div>
            </td>
            <td>${escapeHtml(
              item.medicine?.unit || "",
            )}</td>
            <td class="right">${formatNumber(
              item.quantity,
            )}</td>
            <td class="right">${formatMoney(
              item.unit_price,
            )}</td>
            <td class="right">${formatMoney(
              Number(item.quantity || 0) *
                Number(item.unit_price || 0),
            )}</td>
          </tr>
        `,
      )
      .join("");

    const total = orderItems.reduce(
      (sum, item) =>
        sum +
        Number(item.quantity || 0) *
          Number(item.unit_price || 0),
      0,
    );

    printWindow.document.write(`
      <!doctype html>
      <html lang="vi">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(
          order.sale_code || "Phiếu xuất thuốc",
        )}</title>
        <style>
          @page { size: A4; margin: 16mm; }
          * { box-sizing: border-box; }
          body {
            font-family: Arial, sans-serif;
            color: #111;
            margin: 0;
            background: #fff;
          }
          .sheet {
            width: 100%;
            max-width: 760px;
            margin: 0 auto;
          }
          h1 {
            text-align: center;
            margin: 0 0 6px;
            font-size: 22px;
          }
          .sub {
            text-align: center;
            margin-bottom: 22px;
            font-size: 13px;
          }
          .info {
            width: 100%;
            margin-bottom: 18px;
            font-size: 13px;
          }
          .info td {
            padding: 4px 0;
            vertical-align: top;
          }
          .label {
            width: 125px;
            font-weight: 700;
          }
          table.items {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }
          table.items th,
          table.items td {
            border: 1px solid #333;
            padding: 7px;
          }
          table.items th {
            text-align: center;
          }
          .right {
            text-align: right;
          }
          .muted {
            color: #666;
            font-size: 11px;
            margin-top: 2px;
          }
          .total {
            margin-top: 14px;
            text-align: right;
            font-size: 16px;
            font-weight: 700;
          }
          .footer {
            margin-top: 42px;
            display: flex;
            justify-content: space-between;
            gap: 40px;
            text-align: center;
            font-size: 13px;
          }
          .signature {
            width: 45%;
          }
          .public-id {
            margin-top: 18px;
            font-size: 10px;
            color: #666;
            word-break: break-all;
          }
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <h1>PHIẾU XUẤT THUỐC</h1>
          <div class="sub">
            Số: ${escapeHtml(order.sale_code || "-")}
            (${escapeHtml(
              formatDateTime(order.paid_at),
            )} - Đã thanh toán)
          </div>

          <table class="info">
            <tr>
              <td class="label">Kho xuất:</td>
              <td>${escapeHtml(
                order.warehouse?.name || "-",
              )}</td>
            </tr>
            <tr>
              <td class="label">Khách hàng:</td>
              <td>${escapeHtml(
                order.customer_name || "Khách lẻ",
              )}</td>
            </tr>
            <tr>
              <td class="label">Số điện thoại:</td>
              <td>${escapeHtml(
                order.customer_phone || "-",
              )}</td>
            </tr>
            <tr>
              <td class="label">Ngày sinh:</td>
              <td>${escapeHtml(
                printCustomer?.birth_date
                  ? `${formatBirthDate(
                      printCustomer.birth_date,
                    )}${
                      printCustomer.age !== null &&
                      printCustomer.age !== undefined
                        ? ` (${printCustomer.age} tuổi)`
                        : ""
                    }`
                  : "-",
              )}</td>
            </tr>
            <tr>
              <td class="label">Địa chỉ:</td>
              <td>${escapeHtml(
                printCustomer?.address || "-",
              )}</td>
            </tr>
            <tr>
              <td class="label">Ghi chú:</td>
              <td>${escapeHtml(order.note || "-")}</td>
            </tr>
          </table>

          <table class="items">
            <thead>
              <tr>
                <th>STT</th>
                <th>Thuốc</th>
                <th>ĐVT</th>
                <th>SL</th>
                <th>Đơn giá</th>
                <th>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
          </table>

          <div class="total">
            Tổng tiền: ${formatMoney(total)}
          </div>

          <div class="footer">
            <div class="signature">
              <strong>Người bán</strong>
              <br/><br/><br/>
              ${escapeHtml(
                getUserLabel(order.created_by),
              )}
            </div>
            <div class="signature">
              <strong>Người thanh toán</strong>
              <br/><br/><br/>
              ${escapeHtml(
                getUserLabel(order.paid_by),
              )}
            </div>
          </div>

          <div class="public-id">
            Mã tra cứu: ${escapeHtml(
              order.public_id || "-",
            )}
          </div>
        </div>

        <script>
          window.onload = function () {
            window.print();
          };
        </script>
      </body>
      </html>
    `);

    printWindow.document.close();
  };

  const handlePrintById = async (
    saleId: number,
  ) => {
    const order = await loadOrderDetail(saleId);

    if (order) {
      handlePrint(order);
    }
  };

  /* =========================================================
     ITEM COLUMNS
  ========================================================= */

  const itemColumns = [
    {
      title: "Thuốc",
      key: "medicine",
      render: (_: unknown, item: SalesOrderItem) => (
        <div>
          <Text strong>
            {item.medicine?.name || "-"}
          </Text>
          <br />
          <Text type="secondary">
            {item.medicine?.medicine_code || "-"}
            {item.medicine?.strength
              ? ` • ${item.medicine.strength}`
              : ""}
          </Text>
        </div>
      ),
    },
    {
      title: "ĐVT",
      key: "unit",
      width: 90,
      render: (_: unknown, item: SalesOrderItem) =>
        item.medicine?.unit || "-",
    },
    {
      title: "Số lượng",
      dataIndex: "quantity",
      key: "quantity",
      width: 110,
      align: "right" as const,
      render: (value: number | string) =>
        formatNumber(value),
    },
    {
      title: "Đơn giá",
      dataIndex: "unit_price",
      key: "unit_price",
      width: 140,
      align: "right" as const,
      render: (value: number | string) =>
        formatMoney(value),
    },
    {
      title: "Thành tiền",
      key: "line_total",
      width: 150,
      align: "right" as const,
      render: (_: unknown, item: SalesOrderItem) => (
        <Text strong>
          {formatMoney(
            Number(item.quantity || 0) *
              Number(item.unit_price || 0),
          )}
        </Text>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 130,
      render: (_: unknown, item: SalesOrderItem) =>
        currentEditable ? (
          <Space size={4}>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditItem(item)}
            />

            <Popconfirm
              title="Xóa thuốc khỏi phiếu?"
              okText="Xóa"
              cancelText="Hủy"
              onConfirm={() =>
                void handleDeleteItem(item.id)
              }
            >
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          </Space>
        ) : (
          "-"
        ),
    },
  ];

  /* =========================================================
     HISTORY COLUMNS
  ========================================================= */

  const historyColumns = [
    {
      title: "Mã phiếu",
      dataIndex: "sale_code",
      key: "sale_code",
      width: 190,
      render: (value: string) => (
        <Text strong>{value || "-"}</Text>
      ),
    },
    {
      title: "ID lô",
      key: "batch_ids",
      width: 120,
      align: "center" as const,
      render: (_: unknown, order: SalesOrder) => {
        const batchIds =
          historyBatchMap[order.id] || [];

        if (batchIds.length === 0) {
          return (
            <Text type="secondary">-</Text>
          );
        }

        return (
          <Space size={[2, 2]} wrap>
            {batchIds.map((batchId) => (
              <Button
                key={batchId}
                type="link"
                size="small"
                style={{
                  paddingInline: 2,
                  fontWeight: 600,
                }}
                onClick={() => {
                  window.location.href =
                    `/inventory?batch_id=${batchId}`;
                }}
              >
                #{batchId}
              </Button>
            ))}
          </Space>
        );
      },
    },
    {
      title: "Khách hàng",
      key: "customer",
      render: (_: unknown, order: SalesOrder) => (
        <div>
          <Text>
            {order.customer_name || "Khách lẻ"}
          </Text>
          <br />
          <Text type="secondary">
            {order.customer_phone || "-"}
          </Text>
        </div>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 145,
      render: (value: string) => (
        <Tag color={getStatusColor(value)}>
          {getStatusLabel(value)}
        </Tag>
      ),
    },
    {
      title: "SL",
      dataIndex: "total_quantity",
      key: "total_quantity",
      width: 80,
      align: "right" as const,
      render: (value: number | string) =>
        formatNumber(value),
    },
    {
      title: "Tổng tiền",
      dataIndex: "total_amount",
      key: "total_amount",
      width: 150,
      align: "right" as const,
      render: (value: number | string) => (
        <Text strong>{formatMoney(value)}</Text>
      ),
    },
    {
      title: "Ngày tạo",
      dataIndex: "created_at",
      key: "created_at",
      width: 165,
      render: (value: string) =>
        formatDateTime(value),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 260,
      fixed: "right" as const,
      render: (_: unknown, order: SalesOrder) => (
        <Space wrap size={6}>
          {order.status === "UNPAID" && (
            <Button
              type="primary"
              size="small"
              onClick={() =>
                void loadOrderDetail(order.id, {
                  setAsCurrent: true,
                })
              }
            >
              Tiếp tục bán
            </Button>
          )}

          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() =>
              void loadOrderDetail(order.id, {
                openDrawer: true,
              })
            }
          >
            Chi tiết
          </Button>

          {order.status === "PAID" && (
            <Button
              size="small"
              icon={<PrinterOutlined />}
              onClick={() =>
                void handlePrintById(order.id)
              }
            >
              In phiếu
            </Button>
          )}
        </Space>
      ),
    },
  ];

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            Bán thuốc
          </Title>

          <Text type="secondary">
            Bán tại quầy theo luồng Chưa thanh toán → Đã thanh toán
          </Text>
        </div>

        <Space wrap>
          <Button
            icon={<SearchOutlined />}
            onClick={() => openLookupModal()}
          >
            Tra cứu phiếu
          </Button>

          <Button
            icon={<DollarOutlined />}
            onClick={() => openPriceModal()}
          >
            Cấu hình giá bán
          </Button>

          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void loadWarehouses();
              void loadHistory();

              if (watchedWarehouseId) {
                void loadSaleMedicines(
                  watchedWarehouseId,
                );
              }
            }}
          >
            Làm mới
          </Button>

          {currentOrder && (
            <Button
              type="primary"
              icon={<FileAddOutlined />}
              onClick={handleNewOrder}
            >
              Phiếu mới
            </Button>
          )}
        </Space>
      </div>

      <Alert
        showIcon
        type="info"
        style={{ marginBottom: 16 }}
        message="Nghiệp vụ POS"
        description="Phiếu Chưa thanh toán không làm giảm tồn kho. Chỉ khi nhấn Thanh toán thành công, hệ thống mới chọn lô theo FEFO, trừ tồn và chuyển phiếu sang Đã thanh toán."
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} xl={6}>
          <Card size="small">
            <Statistic
              title="Thuốc có tồn tại Kho bán"
              value={availableMedicines.length}
              prefix={<MedicineBoxOutlined />}
              suffix="loại"
            />
            <Text type="secondary">
              Sẵn sàng bán {sellableMedicines.length} loại · Tổng tồn khả dụng{" "}
              {formatNumber(totalAvailableStock)}
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} xl={6}>
          <Card size="small">
            <Statistic
              title="Phiếu hôm nay"
              value={todayOrders.length}
              prefix={<ShopOutlined />}
              suffix="phiếu"
            />
            <Text type="secondary">
              Đã thanh toán {todayPaidOrders.length}
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} xl={6}>
          <Card size="small">
            <Statistic
              title="Doanh thu hôm nay"
              value={todayRevenue}
              prefix={<DollarOutlined />}
              formatter={(value) =>
                formatMoney(Number(value))
              }
            />
            <Text type="secondary">
              Tính trên các phiếu Đã thanh toán
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} xl={6}>
          <Card size="small">
            <Statistic
              title="Phiếu đang chờ"
              value={unpaidOrderCount}
              prefix={<ShoppingCartOutlined />}
              suffix="phiếu"
            />
            <Text type="secondary">
              Có thể tiếp tục bán từ lịch sử
            </Text>
          </Card>
        </Col>
      </Row>

      {currentOrder && (
        <Card
          style={{ marginBottom: 16 }}
          title="Phiếu đang thao tác"
          extra={
            <Tag color={getStatusColor(currentOrder.status)}>
              {getStatusLabel(currentOrder.status)}
            </Tag>
          }
        >
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} sm={12} xl={5}>
              <Text type="secondary">Mã phiếu</Text>
              <br />
              <Text strong style={{ fontSize: 18 }}>
                {currentOrder.sale_code || "-"}
              </Text>
            </Col>

            <Col xs={24} sm={12} xl={5}>
              <Text type="secondary">Khách hàng</Text>
              <br />
              <Text strong>
                {currentOrder.customer_name || "Khách lẻ"}
              </Text>
              <br />
              <Text type="secondary">
                {currentOrder.customer_phone || "-"}
              </Text>
            </Col>

            <Col xs={24} sm={8} xl={4}>
              <Statistic
                title="Mặt hàng"
                value={items.length}
                suffix="loại"
              />
            </Col>

            <Col xs={24} sm={8} xl={4}>
              <Statistic
                title="Tổng số lượng"
                value={totalQuantity}
              />
            </Col>

            <Col xs={24} sm={8} xl={6}>
              <Statistic
                title="Tạm tính"
                value={totalAmount}
                formatter={(value) =>
                  formatMoney(Number(value))
                }
              />
            </Col>
          </Row>
        </Card>
      )}

      <Card
        title="1. Khách hàng/Bệnh nhân & thông tin phiếu"
        style={{ marginBottom: 16 }}
      >
        <Form
          form={headerForm}
          layout="vertical"
          requiredMark={false}
          disabled={
            currentOrder !== null &&
            currentOrder.status !== "UNPAID"
          }
          onFinish={handleSaveHeader}
        >
          <Alert
            showIcon
            type="info"
            style={{ marginBottom: 16 }}
            message="Tra cứu khách hàng bằng số điện thoại"
            description="SĐT là thông tin nhận diện chính. Hệ thống chỉ hiển thị hồ sơ khi nhập đúng đủ 10 số. Tên khách hàng không dùng để tìm vì nhiều người có thể trùng tên."
          />

          <Row gutter={16}>
            <Col xs={24} lg={8}>
              <Form.Item
                label="Kho bán"
                name="warehouse_id"
                rules={[
                  {
                    required: true,
                    message: "Vui lòng chọn Kho bán",
                  },
                ]}
              >
                <Select
                  loading={masterLoading}
                  placeholder="Chọn Kho bán"
                  options={saleWarehouses.map(
                    (warehouse) => ({
                      value: warehouse.id,
                      label: `${
                        warehouse.warehouse_code ||
                        warehouse.code ||
                        ""
                      } - ${warehouse.name}`,
                    }),
                  )}
                />
              </Form.Item>
            </Col>

            <Col xs={24} lg={8}>
              <Form.Item
                label="Số điện thoại"
                name="customer_phone"
                extra="Để trống nếu bán cho khách lẻ không lưu hồ sơ."
                rules={[
                  {
                    validator: (_, value) => {
                      const phone =
                        normalizePhone(
                          String(value || ""),
                        );

                      if (!phone) {
                        return Promise.resolve();
                      }

                      if (!/^0\d{9}$/.test(phone)) {
                        return Promise.reject(
                          new Error(
                            "SĐT phải gồm 10 chữ số và bắt đầu bằng 0",
                          ),
                        );
                      }

                      if (
                        customerLookupStatus ===
                        "not_found"
                      ) {
                        return Promise.reject(
                          new Error(
                            "SĐT chưa có hồ sơ. Hãy tạo khách hàng trước khi lưu phiếu.",
                          ),
                        );
                      }

                      return Promise.resolve();
                    },
                  },
                ]}
              >
                <Input.Search
                  allowClear
                  maxLength={10}
                  enterButton="Tìm"
                  loading={customerLookupLoading}
                  placeholder="Ví dụ: 0914989572"
                  onChange={(event) => {
                    const phone =
                      normalizePhone(
                        event.target.value,
                      );

                    headerForm.setFieldValue(
                      "customer_phone",
                      phone || undefined,
                    );

                    clearCustomerProfile(true);

                    setCustomerLookupStatus(
                      phone.length === 10
                        ? "idle"
                        : "idle",
                    );
                  }}
                  onSearch={(value) =>
                    void lookupCustomerByPhone(
                      value,
                    )
                  }
                  onBlur={() => {
                    const phone =
                      normalizePhone(
                        headerForm.getFieldValue(
                          "customer_phone",
                        ),
                      );

                    if (
                      /^0\d{9}$/.test(phone) &&
                      customerLookupStatus === "idle"
                    ) {
                      void lookupCustomerByPhone(
                        phone,
                        false,
                      );
                    }
                  }}
                />
              </Form.Item>
            </Col>

            <Col xs={24} lg={8}>
              <Form.Item
                label="Khách hàng/Bệnh nhân"
                name="customer_name"
                dependencies={[
                  "customer_phone",
                ]}
                rules={[
                  {
                    validator: (_, value) => {
                      const phone =
                        normalizePhone(
                          headerForm.getFieldValue(
                            "customer_phone",
                          ),
                        );

                      const name =
                        String(
                          value || "",
                        ).trim();

                      if (!phone && !name) {
                        return Promise.resolve();
                      }

                      if (phone && !name) {
                        return Promise.reject(
                          new Error(
                            "Hãy tra cứu hoặc tạo hồ sơ khách hàng",
                          ),
                        );
                      }

                      return Promise.resolve();
                    },
                  },
                ]}
              >
                <Input
                  disabled
                  placeholder="Tên tự điền sau khi tra cứu SĐT"
                />
              </Form.Item>
            </Col>
          </Row>

          {customerLookupStatus === "not_found" && (
            <Alert
              showIcon
              type="warning"
              style={{ marginBottom: 16 }}
              message="Chưa có khách hàng với SĐT này"
              description={
                <Space
                  direction="vertical"
                  size={8}
                >
                  <Text>
                    SĐT{" "}
                    <Text strong>
                      {normalizePhone(
                        watchedCustomerPhone,
                      )}
                    </Text>{" "}
                    chưa có trong hệ thống.
                  </Text>

                  <Button
                    type="primary"
                    icon={<UserOutlined />}
                    onClick={
                      openCreateCustomerProfile
                    }
                  >
                    Tạo khách hàng
                  </Button>
                </Space>
              }
            />
          )}

          {currentCustomer && (
            <>
              <Card
                size="small"
                style={{ marginBottom: 16 }}
                title="Hồ sơ khách hàng"
                extra={
                  currentEditable || !currentOrder ? (
                    <Button
                      type="link"
                      icon={<EditOutlined />}
                      onClick={
                        openEditCustomerProfile
                      }
                    >
                      Cập nhật hồ sơ
                    </Button>
                  ) : null
                }
              >
                <Row gutter={[16, 12]}>
                  <Col xs={24} md={6}>
                    <Text type="secondary">
                      Họ tên
                    </Text>
                    <br />
                    <Text strong>
                      {currentCustomer.full_name}
                    </Text>
                  </Col>

                  <Col xs={24} md={5}>
                    <Text type="secondary">
                      Số điện thoại
                    </Text>
                    <br />
                    <Text strong>
                      {currentCustomer.phone}
                    </Text>
                  </Col>

                  <Col xs={24} md={5}>
                    <Text type="secondary">
                      Ngày sinh / Tuổi
                    </Text>
                    <br />
                    <Text>
                      {currentCustomer.birth_date
                        ? `${formatBirthDate(
                            currentCustomer.birth_date,
                          )}${
                            currentCustomer.age !== null &&
                            currentCustomer.age !== undefined
                              ? ` (${currentCustomer.age} tuổi)`
                              : ""
                          }`
                        : "-"}
                    </Text>
                  </Col>

                  <Col xs={24} md={8}>
                    <Text type="secondary">
                      Địa chỉ
                    </Text>
                    <br />
                    <Text>
                      {currentCustomer.address || "-"}
                    </Text>
                  </Col>
                </Row>
              </Card>

              <Row
                gutter={[16, 16]}
                style={{ marginBottom: 16 }}
              >
                <Col xs={24} sm={8}>
                  <Card size="small">
                    <Statistic
                      title="Số lần đã mua"
                      value={Number(
                        customerHistorySummary
                          ?.paid_order_count || 0,
                      )}
                      suffix="phiếu"
                    />
                  </Card>
                </Col>

                <Col xs={24} sm={8}>
                  <Card size="small">
                    <Statistic
                      title="Tổng tiền đã mua"
                      value={Number(
                        customerHistorySummary
                          ?.total_spent || 0,
                      )}
                      formatter={(value) =>
                        formatMoney(
                          Number(value),
                        )
                      }
                    />
                  </Card>
                </Col>

                <Col xs={24} sm={8}>
                  <Card size="small">
                    <Statistic
                      title="Lần mua gần nhất"
                      value={
                        customerHistorySummary
                          ?.last_purchase_at
                          ? formatDateTime(
                              customerHistorySummary
                                .last_purchase_at,
                            )
                          : "Chưa có"
                      }
                    />
                  </Card>
                </Col>
              </Row>

              <Card
                size="small"
                title="Lịch sử mua hàng của khách"
                style={{ marginBottom: 16 }}
              >
                <Table
                  rowKey="id"
                  loading={
                    customerHistoryLoading
                  }
                  dataSource={
                    customerPurchaseHistory
                  }
                  pagination={{
                    pageSize: 5,
                    hideOnSinglePage: true,
                  }}
                  scroll={{ x: 900 }}
                  columns={[
                    {
                      title: "Mã phiếu",
                      dataIndex: "sale_code",
                      key: "sale_code",
                      width: 170,
                      render: (value) => (
                        <Text strong>
                          {value || "-"}
                        </Text>
                      ),
                    },
                    {
                      title: "Ngày mua",
                      key: "paid_at",
                      width: 165,
                      render: (
                        _,
                        record,
                      ) =>
                        formatDateTime(
                          record.paid_at ||
                            record.created_at,
                        ),
                    },
                    {
                      title: "Số loại",
                      dataIndex: "item_count",
                      key: "item_count",
                      width: 90,
                      align: "center" as const,
                    },
                    {
                      title: "Số lượng",
                      dataIndex: "total_quantity",
                      key: "total_quantity",
                      width: 100,
                      align: "right" as const,
                      render: (value) =>
                        formatNumber(value),
                    },
                    {
                      title: "Tổng tiền",
                      dataIndex: "total_amount",
                      key: "total_amount",
                      width: 145,
                      align: "right" as const,
                      render: (value) => (
                        <Text strong>
                          {formatMoney(value)}
                        </Text>
                      ),
                    },
                    {
                      title: "Thuốc đã mua",
                      key: "medicines",
                      ellipsis: true,
                      render: (
                        _,
                        record,
                      ) =>
                        (record.items || [])
                          .map(
                            (item) =>
                              `${
                                item.medicine_name ||
                                item.medicine_code ||
                                "Thuốc"
                              } x${formatNumber(
                                item.quantity,
                              )}`,
                          )
                          .join(", ") || "-",
                    },
                    {
                      title: "Chi tiết",
                      key: "actions",
                      fixed: "right" as const,
                      width: 100,
                      render: (
                        _,
                        record,
                      ) => (
                        <Button
                          type="link"
                          icon={<EyeOutlined />}
                          onClick={() =>
                            void loadOrderDetail(
                              record.id,
                              {
                                openDrawer: true,
                              },
                            )
                          }
                        >
                          Xem
                        </Button>
                      ),
                    },
                  ]}
                />
              </Card>
            </>
          )}

          <Row gutter={16}>
            <Col xs={24} md={7}>
              <Form.Item
                label="Ngày sinh"
                name="customer_birth_date"
              >
                <DatePicker
                  disabled
                  format="DD/MM/YYYY"
                  placeholder="Từ hồ sơ khách hàng"
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={5}>
              <Form.Item label="Tuổi">
                <Input
                  disabled
                  value={
                    watchedCustomerAge === null
                      ? ""
                      : `${watchedCustomerAge} tuổi`
                  }
                  placeholder="Tự tính"
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="Địa chỉ"
                name="customer_address"
              >
                <Input.TextArea
                  disabled
                  rows={2}
                  placeholder="Từ hồ sơ khách hàng"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="Ghi chú"
            name="note"
          >
            <Input.TextArea
              rows={2}
              maxLength={500}
              showCount
              placeholder="Ghi chú nếu có"
            />
          </Form.Item>

          {(!currentOrder || currentEditable) && (
            <Button
              type="primary"
              htmlType="submit"
              loading={savingHeader}
              size="large"
            >
              {currentOrder
                ? "Cập nhật thông tin phiếu"
                : "Tạo phiếu bán"}
            </Button>
          )}
        </Form>
      </Card>

      {currentOrder && (
        <Card
          title="2. Quầy thuốc & giỏ hàng"
          extra={
            currentEditable ? (
              <Text type="secondary">
                Chọn thuốc → giá tự động lấy từ giá bán đã cấu hình
              </Text>
            ) : undefined
          }
          style={{ marginBottom: 16 }}
        >
          {currentEditable && (
            <>
              <Title level={5} style={{ marginTop: 0 }}>
                Thuốc bán nhanh
              </Title>

              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Tìm nhanh theo mã thuốc, tên, hoạt chất, hàm lượng..."
                value={quickMedicineSearch}
                onChange={(event) =>
                  setQuickMedicineSearch(
                    event.target.value,
                  )
                }
                style={{
                  marginBottom: 12,
                  maxWidth: 620,
                }}
              />

              {quickMedicines.length > 0 ? (
                <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                  {quickMedicines.map((medicine) => (
                    <Col
                      key={medicine.id}
                      xs={24}
                      sm={12}
                      xl={6}
                    >
                      <Card
                        size="small"
                        hoverable
                        style={{ height: "100%" }}
                      >
                        <Space
                          direction="vertical"
                          size={4}
                          style={{ width: "100%" }}
                        >
                          <Text type="secondary">
                            {medicine.medicine_code || "-"}
                          </Text>

                          <Text strong>
                            {medicine.name || "-"}
                          </Text>

                          <Text type="secondary">
                            {medicine.active_ingredient || "-"}
                            {medicine.strength
                              ? ` • ${medicine.strength}`
                              : ""}
                          </Text>

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 8,
                              marginTop: 4,
                            }}
                          >
                            <Tag>
                              Tồn {formatNumber(
                                medicine.available_quantity,
                              )} {medicine.unit || ""}
                            </Tag>

                            {Number(medicine.selling_price || 0) > 0 ? (
                              <Text strong>
                                {formatMoney(
                                  medicine.selling_price,
                                )}
                              </Text>
                            ) : (
                              <Tag color="orange">
                                Chưa có giá
                              </Tag>
                            )}
                          </div>

                          {medicine.can_sell !== true ? (
                            <Alert
                              showIcon
                              type="warning"
                              message="Chưa đủ điều kiện bán"
                            />
                          ) : Number(medicine.selling_price || 0) <= 0 ? (
                            <Button
                              block
                              onClick={() =>
                                openPriceModal(medicine)
                              }
                            >
                              Cấu hình giá bán
                            </Button>
                          ) : (
                            <Button
                              type="primary"
                              ghost
                              block
                              icon={<ShoppingCartOutlined />}
                              loading={savingItem}
                              onClick={() =>
                                void handleQuickAddMedicine(
                                  medicine,
                                )
                              }
                            >
                              +1 vào giỏ
                            </Button>
                          )}
                        </Space>
                      </Card>
                    </Col>
                  ))}
                </Row>
              ) : (
                <Alert
                  showIcon
                  type="info"
                  style={{ marginBottom: 20 }}
                  message={
                    quickMedicineSearch
                      ? "Không tìm thấy thuốc phù hợp để bán nhanh"
                      : "Không còn thuốc mới để thêm nhanh"
                  }
                  description="Khu vực này hiển thị các thuốc còn tồn tại Kho bán. Thuốc chưa có giá hoặc chưa đủ điều kiện bán vẫn được hiển thị nhưng không thể thêm vào giỏ."
                />
              )}

              <Title level={5}>
                Thêm / chỉnh thuốc chi tiết
              </Title>

              <Form
                form={itemForm}
                layout="vertical"
                requiredMark={false}
                onFinish={handleSaveItem}
              >
                <Row gutter={16}>
                  <Col xs={24} lg={10}>
                    <Form.Item
                      label="Thuốc"
                      name="medicine_id"
                      rules={[
                        {
                          required: true,
                          message:
                            "Vui lòng chọn thuốc",
                        },
                      ]}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder="Chọn thuốc"
                        options={saleMedicines
                          .filter((medicine) => {
                            const available = Number(
                              medicine.available_quantity || 0,
                            );

                            const isCurrentEditingMedicine =
                              editingItemId !== null &&
                              items.some(
                                (item) =>
                                  item.id === editingItemId &&
                                  (item.medicine?.id ??
                                    item.medicine_id) === medicine.id,
                              );

                            if (isCurrentEditingMedicine) {
                              return true;
                            }

                            return (
                              available > 0 &&
                              !existingMedicineIds.has(
                                medicine.id,
                              )
                            );
                          })
                          .map((medicine) => {
                            const hasSellingPrice =
                              Number(medicine.selling_price || 0) > 0;

                            const disabled =
                              medicine.can_sell !== true ||
                              !hasSellingPrice;

                            const reason =
                              medicine.can_sell !== true
                                ? "Chưa đủ điều kiện bán"
                                : !hasSellingPrice
                                  ? "Chưa có giá"
                                  : formatMoney(
                                      medicine.selling_price,
                                    );

                            return {
                              value: medicine.id,
                              disabled,
                              label: `${
                                medicine.medicine_code || ""
                              } - ${medicine.name || ""} - Tồn ${formatNumber(
                                medicine.available_quantity,
                              )} ${medicine.unit || ""} - ${reason}`,
                            };
                          })}
                      />
                    </Form.Item>

                    {saleMedicines.length > 0 &&
                      availableMedicines.filter(
                        (medicine) =>
                          !existingMedicineIds.has(
                            medicine.id,
                          ),
                      ).length === 0 && (
                        <Alert
                          type="warning"
                          showIcon
                          style={{ marginBottom: 12 }}
                          message="Không còn thuốc mới để thêm"
                          description="Các thuốc còn tồn tại Kho bán đều đã có trong giỏ hoặc không còn thuốc khả dụng."
                        />
                      )}
                  </Col>

                  <Col xs={24} sm={12} lg={4}>
                    <Form.Item label="ĐVT">
                      <Input
                        readOnly
                        value={
                          selectedMedicine?.unit || ""
                        }
                        placeholder="-"
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} sm={12} lg={4}>
                    <Form.Item label="Tồn khả dụng">
                      <Input
                        readOnly
                        value={
                          selectedMedicine
                            ? `${formatNumber(
                                selectedMedicine.available_quantity,
                              )} ${
                                selectedMedicine.unit ||
                                ""
                              }`
                            : ""
                        }
                        placeholder="-"
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} sm={12} lg={3}>
                    <Form.Item
                      label="Số lượng"
                      name="quantity"
                      initialValue={1}
                      rules={[
                        {
                          required: true,
                          message:
                            "Nhập số lượng",
                        },
                        {
                          validator: async (
                            _,
                            value,
                          ) => {
                            const number =
                              Number(value);

                            if (
                              !Number.isInteger(
                                number,
                              ) ||
                              number <= 0
                            ) {
                              throw new Error(
                                "Phải là số nguyên > 0",
                              );
                            }

                            if (
                              selectedMedicine &&
                              number >
                                Number(
                                  selectedMedicine.available_quantity ||
                                    0,
                                )
                            ) {
                              throw new Error(
                                "Vượt tồn khả dụng",
                              );
                            }
                          },
                        },
                      ]}
                    >
                      <InputNumber
                        min={1}
                        precision={0}
                        style={{ width: "100%" }}
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} sm={12} lg={3}>
                    <Form.Item label="Đơn giá">
                      <Input
                        readOnly
                        value={
                          selectedMedicine?.selling_price
                            ? formatMoney(
                                selectedMedicine.selling_price,
                              )
                            : ""
                        }
                        status={
                          selectedMedicine &&
                          !selectedMedicine.selling_price
                            ? "error"
                            : undefined
                        }
                        placeholder="Chưa có giá"
                      />
                    </Form.Item>
                  </Col>
                </Row>

                {selectedMedicine &&
                  !selectedMedicine.selling_price && (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: 16 }}
                      message="Thuốc chưa có giá bán"
                      description={
                        <Space wrap>
                          <span>
                            Cần cấu hình giá bán trước khi thêm thuốc vào phiếu.
                          </span>
                          <Button
                            size="small"
                            onClick={() =>
                              openPriceModal(
                                selectedMedicine,
                              )
                            }
                          >
                            Cấu hình giá
                          </Button>
                        </Space>
                      }
                    />
                  )}

                {selectedMedicine && (
                  <Row gutter={16}>
                    <Col xs={24} md={8}>
                      <Card size="small">
                        <Statistic
                          title="Giá bán"
                          value={Number(
                            selectedMedicine.selling_price ||
                              0,
                          )}
                          formatter={(value) =>
                            formatMoney(
                              Number(value),
                            )
                          }
                        />
                      </Card>
                    </Col>

                    <Col xs={24} md={8}>
                      <Card size="small">
                        <Statistic
                          title="Số lượng"
                          value={
                            Number(
                              watchedQuantity || 1,
                            ) || 1
                          }
                          suffix={
                            selectedMedicine.unit || ""
                          }
                        />
                      </Card>
                    </Col>

                    <Col xs={24} md={8}>
                      <Card size="small">
                        <Statistic
                          title="Thành tiền"
                          value={selectedLineTotal}
                          formatter={(value) =>
                            formatMoney(
                              Number(value),
                            )
                          }
                        />
                      </Card>
                    </Col>
                  </Row>
                )}

                <Space
                  wrap
                  style={{ marginTop: 16 }}
                >
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={savingItem}
                    disabled={
                      !selectedMedicine ||
                      !selectedMedicine.selling_price
                    }
                    icon={
                      editingItemId === null ? (
                        <ShoppingCartOutlined />
                      ) : (
                        <EditOutlined />
                      )
                    }
                  >
                    {editingItemId === null
                      ? "Thêm vào phiếu"
                      : "Cập nhật"}
                  </Button>

                  {editingItemId !== null && (
                    <Button
                      onClick={handleCancelEdit}
                    >
                      Hủy sửa
                    </Button>
                  )}
                </Space>
              </Form>

              <div
                style={{
                  margin: "20px 0 16px",
                  borderTop:
                    "1px solid #f0f0f0",
                }}
              />
            </>
          )}

          <Title level={5} style={{ marginTop: 4 }}>
            Giỏ hàng
          </Title>

          <Table
            rowKey="id"
            columns={itemColumns}
            dataSource={items}
            pagination={false}
            scroll={{ x: 900 }}
            locale={{
              emptyText:
                "Phiếu chưa có thuốc",
            }}
          />

          <Row
            gutter={[16, 16]}
            justify="end"
            style={{ marginTop: 20 }}
          >
            <Col xs={24} sm={8} lg={6}>
              <Card size="small">
                <Statistic
                  title="Tổng số lượng"
                  value={totalQuantity}
                />
              </Card>
            </Col>

            <Col xs={24} sm={8} lg={6}>
              <Card size="small">
                <Statistic
                  title="Tổng tiền"
                  value={totalAmount}
                  formatter={(value) =>
                    formatMoney(Number(value))
                  }
                />
              </Card>
            </Col>
          </Row>
        </Card>
      )}

      {currentOrder?.status === "UNPAID" && (
        <Card
          title="3. Thanh toán"
          style={{ marginBottom: 16 }}
        >
          <Row gutter={[20, 20]} align="top">
            <Col xs={24}>
              <Descriptions
                bordered
                size="small"
                column={1}
              >
                <Descriptions.Item label="Khách hàng">
                  {currentOrder.customer_name || "Khách lẻ"}
                </Descriptions.Item>

                <Descriptions.Item label="Số điện thoại">
                  {currentOrder.customer_phone || "-"}
                </Descriptions.Item>

                <Descriptions.Item label="Số mặt hàng">
                  {items.length} loại / {formatNumber(totalQuantity)} đơn vị
                </Descriptions.Item>

                <Descriptions.Item label="Tổng thanh toán">
                  <Text strong style={{ fontSize: 18 }}>
                    {formatMoney(totalAmount)}
                  </Text>
                </Descriptions.Item>
              </Descriptions>

              <Alert
                showIcon
                type="info"
                style={{ marginTop: 12 }}
                message="Xuất kho theo FEFO"
                description="Khi thanh toán, hệ thống kiểm tra tồn lần cuối, tự chọn lô có hạn dùng gần nhất còn hợp lệ và ghi SALE_OUT."
              />
            </Col>
          </Row>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 20,
            }}
          >
            <Popconfirm
              title="Xác nhận thanh toán?"
              description={`Tổng tiền ${formatMoney(
                totalAmount,
              )}. Sau khi thanh toán, phiếu không thể sửa và tồn kho sẽ bị trừ.`}
              okText="Thanh toán"
              cancelText="Hủy"
              disabled={items.length === 0}
              onConfirm={() => void handlePay()}
            >
              <Button
                type="primary"
                size="large"
                icon={<DollarOutlined />}
                loading={paying}
                disabled={items.length === 0}
              >
                Thanh toán {formatMoney(totalAmount)}
              </Button>
            </Popconfirm>
          </div>
        </Card>
      )}

      {currentOrder?.status === "PAID" && (
        <Alert
          showIcon
          type="success"
          style={{ marginBottom: 16 }}
          message="Phiếu đã thanh toán"
          description={
            <Space wrap>
              <span>
                Thanh toán lúc{" "}
                {formatDateTime(
                  currentOrder.paid_at,
                )}. Tồn kho đã được xuất theo FEFO.
              </span>

              <Button
                type="primary"
                icon={<PrinterOutlined />}
                onClick={() =>
                  handlePrint({
                    ...currentOrder,
                    items,
                    allocations,
                  })
                }
              >
                In phiếu xuất thuốc
              </Button>
            </Space>
          }
        />
      )}

      <Card
        title="4. Lịch sử phiếu bán"
        extra={
          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Mã phiếu, tên khách hàng hoặc SĐT..."
              value={historySearch}
              style={{ width: 240 }}
              onChange={(event) =>
                setHistorySearch(
                  event.target.value,
                )
              }
              onPressEnter={() =>
                void loadHistory(
                  historyStatus,
                  historySearch,
                )
              }
            />

            <Select
              allowClear
              placeholder="Tất cả trạng thái"
              value={historyStatus}
              style={{ width: 170 }}
              options={[
                {
                  value: "UNPAID",
                  label: "Chưa thanh toán",
                },
                {
                  value: "PAID",
                  label: "Đã thanh toán",
                },
              ]}
              onChange={(value) => {
                setHistoryStatus(value);
                void loadHistory(
                  value,
                  historySearch,
                );
              }}
            />

            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={() =>
                void loadHistory(
                  historyStatus,
                  historySearch,
                )
              }
            >
              Tìm
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={historyColumns}
          dataSource={orders}
          loading={historyLoading}
          scroll={{ x: 1200 }}
          pagination={{
            pageSize: 10,
            showTotal: (total) =>
              `Tổng ${total} phiếu`,
          }}
        />
      </Card>

      <Drawer
        title={
          detailOrder
            ? `Chi tiết ${
                detailOrder.sale_code || ""
              }`
            : "Chi tiết phiếu bán"
        }
        width={800}
        open={drawerOpen}
        loading={detailLoading}
        destroyOnHidden
        onClose={() => {
          setDrawerOpen(false);
          setDetailOrder(null);
        }}
      >
        {detailOrder && (
          <>
            <Descriptions
              bordered
              column={1}
              size="small"
            >
              <Descriptions.Item label="Mã phiếu">
                {detailOrder.sale_code || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Trạng thái">
                <Tag
                  color={getStatusColor(
                    detailOrder.status,
                  )}
                >
                  {getStatusLabel(
                    detailOrder.status,
                  )}
                </Tag>
              </Descriptions.Item>

              <Descriptions.Item label="Kho bán">
                {detailOrder.warehouse?.name ||
                  "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Khách hàng">
                {detailOrder.customer_name ||
                  "Khách lẻ"}
              </Descriptions.Item>

              <Descriptions.Item label="Số điện thoại">
                {detailOrder.customer_phone ||
                  "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Ngày sinh / Tuổi">
                {detailCustomer?.birth_date
                  ? `${formatBirthDate(
                      detailCustomer.birth_date,
                    )}${
                      detailCustomer.age !== null &&
                      detailCustomer.age !== undefined
                        ? ` (${detailCustomer.age} tuổi)`
                        : ""
                    }`
                  : "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Địa chỉ">
                {detailCustomer?.address ||
                  "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Ngày tạo">
                {formatDateTime(
                  detailOrder.created_at,
                )}
              </Descriptions.Item>

              <Descriptions.Item label="Thanh toán lúc">
                {formatDateTime(
                  detailOrder.paid_at,
                )}
              </Descriptions.Item>

              <Descriptions.Item label="Người thanh toán">
                {getUserLabel(
                  detailOrder.paid_by,
                )}
              </Descriptions.Item>

              <Descriptions.Item label="Mã tra cứu">
                <Text copyable>
                  {detailOrder.public_id || "-"}
                </Text>
              </Descriptions.Item>
            </Descriptions>

            <Title
              level={5}
              style={{ marginTop: 24 }}
            >
              Thuốc trong phiếu
            </Title>

            <Table
              rowKey="id"
              columns={itemColumns.filter(
                (column) =>
                  column.key !== "actions",
              )}
              dataSource={
                detailOrder.items || []
              }
              pagination={false}
              scroll={{ x: 700 }}
            />

            {detailOrder.status ===
              "PAID" && (
              <Button
                type="primary"
                icon={<PrinterOutlined />}
                style={{ marginTop: 20 }}
                onClick={() =>
                  handlePrint(detailOrder)
                }
              >
                In phiếu xuất thuốc
              </Button>
            )}
          </>
        )}
      </Drawer>

      <Modal
        title={
          customerProfileMode === "edit"
            ? "Cập nhật hồ sơ khách hàng"
            : "Tạo hồ sơ khách hàng"
        }
        open={customerProfileModalOpen}
        okText={
          customerProfileMode === "edit"
            ? "Lưu hồ sơ"
            : "Tạo khách hàng"
        }
        cancelText="Hủy"
        confirmLoading={customerProfileSaving}
        destroyOnHidden
        onOk={() =>
          customerProfileForm.submit()
        }
        onCancel={() => {
          if (customerProfileSaving) {
            return;
          }

          setCustomerProfileModalOpen(false);
          customerProfileForm.resetFields();
        }}
      >
        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 16 }}
          message="Hồ sơ khách hàng, không phải tài khoản đăng nhập"
          description="SĐT dùng để nhận diện khách hàng và liên kết lịch sử mua thuốc. Hồ sơ này không có quyền đăng nhập hệ thống."
        />

        <Form
          form={customerProfileForm}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) =>
            void handleSaveCustomerProfile(
              values,
            )
          }
        >
          <Form.Item label="Số điện thoại">
            <Input
              disabled
              value={normalizePhone(
                watchedCustomerPhone,
              )}
            />
          </Form.Item>

          <Form.Item
            label="Họ tên"
            name="full_name"
            rules={[
              {
                required: true,
                whitespace: true,
                message:
                  "Vui lòng nhập họ tên",
              },
            ]}
          >
            <Input
              maxLength={150}
              placeholder="Nhập họ tên khách hàng"
            />
          </Form.Item>

          <Form.Item
            label="Ngày sinh"
            name="birth_date"
            rules={[
              {
                validator: async (
                  _,
                  value,
                ) => {
                  if (!value) {
                    return;
                  }

                  if (
                    dayjs(value).isAfter(
                      dayjs(),
                      "day",
                    )
                  ) {
                    throw new Error(
                      "Ngày sinh không được lớn hơn ngày hiện tại",
                    );
                  }

                  if (
                    dayjs().diff(
                      dayjs(value),
                      "year",
                    ) > 120
                  ) {
                    throw new Error(
                      "Ngày sinh không hợp lệ",
                    );
                  }
                },
              },
            ]}
          >
            <DatePicker
              format="DD/MM/YYYY"
              placeholder="Chọn ngày sinh"
              style={{ width: "100%" }}
              disabledDate={(current) =>
                Boolean(
                  current &&
                  current.isAfter(
                    dayjs(),
                    "day",
                  ),
                )
              }
            />
          </Form.Item>

          <Form.Item
            label="Địa chỉ"
            name="address"
          >
            <Input.TextArea
              rows={3}
              maxLength={300}
              showCount
              placeholder="Nhập địa chỉ khách hàng"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Tra cứu phiếu bán"
        open={lookupModalOpen}
        footer={null}
        destroyOnHidden
        onCancel={() => {
          if (lookupLoading) {
            return;
          }

          setLookupModalOpen(false);
        }}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Nhập mã tra cứu phiếu"
          description="Nhập UUID của phiếu hoặc đường dẫn có chứa mã tra cứu; hệ thống sẽ tự lấy public_id."
        />

        <Input.Search
          allowClear
          autoFocus
          size="large"
          enterButton="Tra cứu"
          loading={lookupLoading}
          placeholder="Ví dụ: 1a4d63cd-1d6a-4e4c-889f-2fc868411a9a"
          value={lookupValue}
          onChange={(event) =>
            setLookupValue(
              event.target.value,
            )
          }
          onSearch={(value) =>
            void lookupSaleByPublicId(value)
          }
        />

        <Text
          type="secondary"
          style={{
            display: "block",
            marginTop: 12,
          }}
        >
          Tra cứu chỉ dùng để xem phiếu. Quét QR
          không thực hiện thanh toán hay thay đổi tồn kho.
        </Text>
      </Modal>

      <Modal
        title="Cấu hình giá bán thuốc"
        open={priceModalOpen}
        okText="Lưu giá bán"
        cancelText="Hủy"
        confirmLoading={savingPrice}
        onOk={() => priceForm.submit()}
        onCancel={() => {
          if (savingPrice) {
            return;
          }

          setPriceModalOpen(false);
          priceForm.resetFields();
        }}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Giá bán được lưu ở danh mục thuốc"
          description="Khi chọn thuốc trên phiếu bán, hệ thống tự lấy giá này. Giá nhập gần nhất không được dùng làm giá bán."
        />

        <Form
          form={priceForm}
          layout="vertical"
          requiredMark={false}
          onFinish={handleSavePrice}
        >
          <Form.Item
            label="Thuốc"
            name="medicine_id"
            rules={[
              {
                required: true,
                message: "Vui lòng chọn thuốc",
              },
            ]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Chọn thuốc"
              options={saleMedicines.map(
                (medicine) => ({
                  value: medicine.id,
                  label: `${
                    medicine.medicine_code ||
                    ""
                  } - ${
                    medicine.name || ""
                  } - ${
                    medicine.selling_price
                      ? formatMoney(
                          medicine.selling_price,
                        )
                      : "Chưa có giá"
                  }`,
                }),
              )}
              onChange={(medicineId) => {
                const medicine =
                  saleMedicines.find(
                    (item) =>
                      item.id === medicineId,
                  );

                priceForm.setFieldValue(
                  "selling_price",
                  medicine?.selling_price
                    ? Number(
                        medicine.selling_price,
                      )
                    : undefined,
                );
              }}
            />
          </Form.Item>

          <Form.Item
            label="Giá bán"
            name="selling_price"
            rules={[
              {
                required: true,
                message: "Vui lòng nhập giá bán",
              },
              {
                validator: async (_, value) => {
                  const number = Number(value);

                  if (
                    !Number.isInteger(number) ||
                    number <= 0
                  ) {
                    throw new Error(
                      "Giá bán phải là số nguyên lớn hơn 0",
                    );
                  }
                },
              },
            ]}
          >
            <InputNumber<number>
              min={1}
              precision={0}
              controls={false}
              style={{ width: "100%" }}
              formatter={(value) =>
                value
                  ? new Intl.NumberFormat(
                      "vi-VN",
                    ).format(Number(value))
                  : ""
              }
              parser={(value) => {
                const digits = (value || "").replace(
                  /\D/g,
                  "",
                );

                return digits ? Number(digits) : 0;
              }}
              addonAfter="đ"
              placeholder="Ví dụ: 25000"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default Sales;
