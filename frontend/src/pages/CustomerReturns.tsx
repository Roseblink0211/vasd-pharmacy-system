import { useEffect, useMemo, useState } from "react";

import {
  CheckCircleOutlined,
  EyeOutlined,
  PrinterOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SearchOutlined,
  StopOutlined,
} from "@ant-design/icons";

import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";

import type { TableColumnsType } from "antd";

import dayjs from "dayjs";

import api from "../api/api";

const { Text, Title } = Typography;


/* =========================================================
   TYPES
========================================================= */

interface CustomerProfile {
  id?: number;
  full_name?: string;
  phone?: string;
  birth_date?: string | null;
  age?: number | null;
  address?: string | null;
}

interface PurchaseOrder {
  id: number;
  sale_code?: string | null;
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
    strength?: string | null;
    unit?: string | null;
    quantity?: number | string;
    unit_price?: number | string;
    line_total?: number | string;
  }>;
}

interface ReturnableItem {
  sale_item_id: number;

  medicine?: {
    id?: number;
    medicine_code?: string;
    name?: string;
    active_ingredient?: string | null;
    strength?: string | null;
    unit?: string | null;
  };

  purchased_quantity?: number | string;
  unit_price?: number | string;
  purchased_line_total?: number | string;

  completed_return_quantity?: number | string;
  reserved_in_other_drafts?: number | string;

  current_return_item_id?: number | null;
  current_return_quantity?: number | string;

  remaining_returnable_quantity?: number | string;
}

interface SaleAllocationRef {
  id?: number;
  sale_item_id?: number;
  batch_id?: number;
  quantity?: number | string;
  lot_number?: string | null;
  expiry_date?: string | null;
}

interface CustomerReturnSummary {
  id: number;
  return_code?: string | null;
  status?: string | null;

  sale_id?: number;
  sale_code?: string | null;

  customer_name?: string | null;
  customer_phone?: string | null;

  warehouse_name?: string | null;

  reason?: string | null;
  note?: string | null;

  item_count?: number | string;
  total_quantity?: number | string;
  total_refund?: number | string;

  created_at?: string | null;
  completed_at?: string | null;
}

interface CustomerReturnItem {
  id?: number;
  sale_item_id?: number;

  medicine?: {
    id?: number;
    medicine_code?: string;
    name?: string;
    active_ingredient?: string | null;
    strength?: string | null;
    unit?: string | null;
  };

  quantity?: number | string;
  unit_price?: number | string;
  line_refund?: number | string;
}

interface CustomerReturnAllocation {
  id?: number;
  return_item_id?: number;
  sale_allocation_id?: number;
  batch_id?: number;
  lot_number?: string | null;
  expiry_date?: string | null;
  quantity?: number | string;
}

interface CustomerReturnDetail {
  id: number;
  return_code?: string | null;
  sale_id?: number;
  sale_code?: string | null;

  customer_phone?: string | null;
  customer_name?: string | null;
  customer?: CustomerProfile | null;

  warehouse?: {
    id?: number;
    warehouse_code?: string;
    name?: string;
  };

  reason?: string | null;
  note?: string | null;
  status?: string | null;

  created_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;

  created_by?: {
    id?: number;
    full_name?: string;
    email?: string;
  } | null;

  completed_by?: {
    id?: number;
    full_name?: string;
    email?: string;
  } | null;
}

interface ReturnHeaderFormValues {
  reason: string;
  note?: string;
}


/* =========================================================
   HELPERS
========================================================= */

function normalizeArray<T>(
  data: unknown,
  keys: string[],
): T[] {
  if (Array.isArray(data)) {
    return data as T[];
  }

  if (
    typeof data !== "object" ||
    data === null
  ) {
    return [];
  }

  const value =
    data as Record<string, unknown>;

  for (const key of keys) {
    if (Array.isArray(value[key])) {
      return value[key] as T[];
    }
  }

  return [];
}


function normalizePhone(
  value?: string | null,
) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 10);
}


function formatNumber(
  value?: number | string | null,
) {
  return Number(value || 0).toLocaleString(
    "vi-VN",
  );
}


function formatMoney(
  value?: number | string | null,
) {
  return `${Number(value || 0).toLocaleString(
    "vi-VN",
  )} đ`;
}


function formatDateTime(
  value?: string | null,
) {
  if (!value) {
    return "-";
  }

  const date = dayjs(value);

  return date.isValid()
    ? date.format("DD/MM/YYYY HH:mm")
    : value;
}


function formatDate(
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


function getReturnStatusLabel(
  status?: string | null,
) {
  switch (status) {
    case "DRAFT":
      return "Mới";

    case "COMPLETED":
      return "Đã hoàn";

    case "CANCELLED":
      return "Đã hủy";

    default:
      return status || "-";
  }
}


function getReturnStatusColor(
  status?: string | null,
) {
  switch (status) {
    case "DRAFT":
      return "orange";

    case "COMPLETED":
      return "green";

    case "CANCELLED":
      return "default";

    default:
      return "default";
  }
}


/* =========================================================
   COMPONENT
========================================================= */

function CustomerReturns() {
  const [returnForm] =
    Form.useForm<ReturnHeaderFormValues>();

  const [phone, setPhone] = useState("");

  const [customer, setCustomer] =
    useState<CustomerProfile | null>(null);

  const [paidOrders, setPaidOrders] =
    useState<PurchaseOrder[]>([]);

  const [
    saleReturnability,
    setSaleReturnability,
  ] = useState<Record<number, number>>({});

  const [
    selectedSale,
    setSelectedSale,
  ] = useState<PurchaseOrder | null>(null);

  const [
    returnableItems,
    setReturnableItems,
  ] = useState<ReturnableItem[]>([]);

  const [
    saleAllocationBatchMap,
    setSaleAllocationBatchMap,
  ] = useState<Record<number, number[]>>({});

  const [
    desiredQuantities,
    setDesiredQuantities,
  ] = useState<Record<number, number>>({});

  const [
    returnQuantityTouched,
    setReturnQuantityTouched,
  ] = useState<Record<number, boolean>>({});

  const [
    currentReturnId,
    setCurrentReturnId,
  ] = useState<number | null>(null);

  const [
    currentReturnDetail,
    setCurrentReturnDetail,
  ] = useState<CustomerReturnDetail | null>(
    null,
  );

  const [
    customerReturns,
    setCustomerReturns,
  ] = useState<CustomerReturnSummary[]>([]);

  const [
    returnBatchMap,
    setReturnBatchMap,
  ] = useState<Record<number, number[]>>({});

  const [lookupLoading, setLookupLoading] =
    useState(false);

  const [
    returnableLoading,
    setReturnableLoading,
  ] = useState(false);

  const [
    returnListLoading,
    setReturnListLoading,
  ] = useState(false);

  const [creating, setCreating] =
    useState(false);

  const [savingItems, setSavingItems] =
    useState(false);

  const [completing, setCompleting] =
    useState(false);

  const [cancelling, setCancelling] =
    useState(false);

  const [
    drawerOpen,
    setDrawerOpen,
  ] = useState(false);

  const [
    drawerLoading,
    setDrawerLoading,
  ] = useState(false);

  const [
    drawerDetail,
    setDrawerDetail,
  ] = useState<CustomerReturnDetail | null>(
    null,
  );

  const [
    drawerItems,
    setDrawerItems,
  ] = useState<CustomerReturnItem[]>([]);

  const [
    drawerAllocations,
    setDrawerAllocations,
  ] = useState<CustomerReturnAllocation[]>([]);

  const [
    drawerTotalQuantity,
    setDrawerTotalQuantity,
  ] = useState(0);

  const [
    drawerTotalRefund,
    setDrawerTotalRefund,
  ] = useState(0);


  /* =========================================================
     DERIVED
  ========================================================= */

  const currentDraft =
    currentReturnDetail?.status === "DRAFT";

  const currentCompleted =
    currentReturnDetail?.status ===
    "COMPLETED";

  const savedReturnQuantity =
    useMemo(
      () =>
        returnableItems.reduce(
          (total, item) =>
            total +
            Number(
              item.current_return_quantity ||
                0,
            ),
          0,
        ),
      [returnableItems],
    );

  const desiredReturnQuantity =
    useMemo(
      () =>
        Object.values(
          desiredQuantities,
        ).reduce(
          (total, value) =>
            total + Number(value || 0),
          0,
        ),
      [desiredQuantities],
    );

  const desiredRefundAmount =
    useMemo(
      () =>
        returnableItems.reduce(
          (total, item) => {
            const quantity =
              Number(
                desiredQuantities[
                  item.sale_item_id
                ] || 0,
              );

            return (
              total +
              quantity *
                Number(
                  item.unit_price || 0,
                )
            );
          },
          0,
        ),
      [
        desiredQuantities,
        returnableItems,
      ],
    );


  /* =========================================================
     INITIAL RETURN LIST
  ========================================================= */

  useEffect(() => {
    void loadCustomerReturns();
  }, []);


  /* =========================================================
     RESET CURRENT FLOW
  ========================================================= */

  const resetCurrentFlow = () => {
    setSelectedSale(null);

    setReturnableItems([]);
    setSaleAllocationBatchMap({});

    setDesiredQuantities({});
    setReturnQuantityTouched({});

    setCurrentReturnId(null);

    setCurrentReturnDetail(null);

    returnForm.resetFields();
  };


  /* =========================================================
     CUSTOMER LOOKUP
  ========================================================= */

  const loadSaleReturnability = async (
    orders: PurchaseOrder[],
  ) => {
    const results = await Promise.all(
      orders.map(async (order) => {
        try {
          const response = await api.get(
            `/customer-returns/sales/${order.id}/returnable-items`,
          );

          if (
            response.data?.success !== true
          ) {
            return [order.id, 0] as const;
          }

          const items =
            normalizeArray<ReturnableItem>(
              response.data,
              ["items"],
            );

          const remaining = items.reduce(
            (total, item) =>
              total +
              Number(
                item.remaining_returnable_quantity ||
                  0,
              ),
            0,
          );

          return [
            order.id,
            remaining,
          ] as const;
        } catch (error) {
          console.error(
            `Load returnability for sale ${order.id}:`,
            error,
          );

          return [order.id, 0] as const;
        }
      }),
    );

    setSaleReturnability(
      Object.fromEntries(results) as Record<
        number,
        number
      >,
    );
  };


  const handleLookupCustomer = async () => {
    const normalized =
      normalizePhone(phone);

    setPhone(normalized);

    if (!/^0\d{9}$/.test(normalized)) {
      message.warning(
        "SĐT phải gồm 10 chữ số và bắt đầu bằng 0",
      );

      return;
    }

    try {
      setLookupLoading(true);

      const response = await api.get(
        `/sales-customers/by-phone/${normalized}/purchase-history`,
        {
          params: {
            limit: 100,
          },
        },
      );

      if (
        response.data?.success !== true
      ) {
        message.error(
          response.data?.message ||
            "Không thể tra cứu khách hàng",
        );

        return;
      }

      if (
        response.data?.found !== true
      ) {
        setCustomer(null);
        setPaidOrders([]);
        setSaleReturnability({});
        resetCurrentFlow();

        message.warning(
          "Không tìm thấy khách hàng với SĐT này",
        );

        await loadCustomerReturns(
          normalized,
        );

        return;
      }

      setCustomer(
        response.data
          .customer as CustomerProfile,
      );

      const loadedOrders =
        normalizeArray<PurchaseOrder>(
          response.data,
          ["orders"],
        );

      setPaidOrders(
        loadedOrders,
      );

      await loadSaleReturnability(
        loadedOrders,
      );

      resetCurrentFlow();

      await loadCustomerReturns(
        normalized,
      );

      message.success(
        "Đã tìm thấy khách hàng",
      );
    } catch (error) {
      console.error(
        "Lookup customer:",
        error,
      );

      message.error(
        "Có lỗi khi tra cứu khách hàng",
      );
    } finally {
      setLookupLoading(false);
    }
  };


  /* =========================================================
     LOAD RETURN LIST
  ========================================================= */

  const loadReturnBatchMap = async (
    returnList: CustomerReturnSummary[],
  ) => {
    const results = await Promise.all(
      returnList.map(async (record) => {
        try {
          const response = await api.get(
            `/customer-returns/${record.id}`,
          );

          const allocations =
            normalizeArray<CustomerReturnAllocation>(
              response.data,
              ["allocations"],
            );

          const batchIds = Array.from(
            new Set(
              allocations
                .map((item) =>
                  Number(item.batch_id),
                )
                .filter(
                  (batchId) =>
                    Number.isFinite(batchId) &&
                    batchId > 0,
                ),
            ),
          );

          return [
            record.id,
            batchIds,
          ] as const;
        } catch (error) {
          console.error(
            `Load batch IDs for customer return ${record.id}:`,
            error,
          );

          return [
            record.id,
            [] as number[],
          ] as const;
        }
      }),
    );

    setReturnBatchMap(
      Object.fromEntries(results) as Record<
        number,
        number[]
      >,
    );
  };


  const loadCustomerReturns = async (
    targetPhone?: string,
  ) => {
    try {
      setReturnListLoading(true);

      const params: {
        phone?: string;
      } = {};

      const normalized =
        normalizePhone(targetPhone);

      if (/^0\d{9}$/.test(normalized)) {
        params.phone = normalized;
      }

      const response = await api.get(
        "/customer-returns",
        { params },
      );

      if (
        response.data?.success !== true
      ) {
        message.error(
          response.data?.message ||
            "Không thể tải danh sách phiếu hoàn",
        );

        return;
      }

      const loadedReturns =
        normalizeArray<CustomerReturnSummary>(
          response.data,
          [
            "data",
            "returns",
            "customer_returns",
          ],
        );

      setCustomerReturns(
        loadedReturns,
      );

      await loadReturnBatchMap(
        loadedReturns,
      );
    } catch (error) {
      console.error(
        "Load customer returns:",
        error,
      );

      message.error(
        "Không thể tải danh sách phiếu hoàn",
      );
    } finally {
      setReturnListLoading(false);
    }
  };


  /* =========================================================
     SELECT SALE + RETURNABLE
  ========================================================= */

  const loadReturnableItems = async (
    saleId: number,
    returnId?: number | null,
  ) => {
    try {
      setReturnableLoading(true);

      const response = await api.get(
        `/customer-returns/sales/${saleId}/returnable-items`,
        {
          params: returnId
            ? {
                return_id: returnId,
              }
            : undefined,
        },
      );

      if (
        response.data?.success !== true
      ) {
        message.error(
          response.data?.message ||
            "Không thể tải số lượng được hoàn",
        );

        return false;
      }

      const items =
        normalizeArray<ReturnableItem>(
          response.data,
          ["items"],
        );

      setReturnableItems(items);

      /*
       * Lấy allocation thật của phiếu bán để biết từng thuốc
       * đã được xuất từ batch nào. Đây là nguồn dùng để hiển thị
       * ID lô ngay trong bảng Hoàn khách hàng.
       */
      try {
        const saleResponse =
          await api.get(
            `/sales-orders/${saleId}`,
          );

        const allocations =
          normalizeArray<SaleAllocationRef>(
            saleResponse.data,
            ["allocations"],
          );

        const nextBatchMap:
          Record<number, number[]> = {};

        allocations.forEach(
          (allocation) => {
            const saleItemId =
              Number(
                allocation.sale_item_id,
              );

            const batchId =
              Number(
                allocation.batch_id,
              );

            if (
              !Number.isFinite(
                saleItemId,
              ) ||
              saleItemId <= 0 ||
              !Number.isFinite(
                batchId,
              ) ||
              batchId <= 0
            ) {
              return;
            }

            if (
              !nextBatchMap[
                saleItemId
              ]
            ) {
              nextBatchMap[
                saleItemId
              ] = [];
            }

            if (
              !nextBatchMap[
                saleItemId
              ].includes(batchId)
            ) {
              nextBatchMap[
                saleItemId
              ].push(batchId);
            }
          },
        );

        setSaleAllocationBatchMap(
          nextBatchMap,
        );
      } catch (allocationError) {
        console.error(
          "Load sale allocations for customer return:",
          allocationError,
        );

        setSaleAllocationBatchMap({});
      }

      const next: Record<
        number,
        number
      > = {};

      items.forEach((item) => {
        next[item.sale_item_id] =
          Number(
            item.current_return_quantity ||
              0,
          );
      });

      setDesiredQuantities(next);
      setReturnQuantityTouched({});

      return true;
    } catch (error) {
      console.error(
        "Load returnable items:",
        error,
      );

      message.error(
        "Không thể tải thông tin hoàn thuốc",
      );

      return false;
    } finally {
      setReturnableLoading(false);
    }
  };


  const handleSelectSale = async (
    order: PurchaseOrder,
  ) => {
    const remaining =
      saleReturnability[order.id];

    if (
      remaining !== undefined &&
      remaining <= 0
    ) {
      message.info(
        "Phiếu bán này đã hoàn hết thuốc, không thể tạo thêm phiếu hoàn.",
      );
      return;
    }

    resetCurrentFlow();

    setSelectedSale(order);

    const ok =
      await loadReturnableItems(
        order.id,
      );

    if (ok) {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  };


  /* =========================================================
     RETURN DETAIL
  ========================================================= */

  const loadReturnDetail = async (
    returnId: number,
  ) => {
    const response = await api.get(
      `/customer-returns/${returnId}`,
    );

    if (
      response.data?.success !== true
    ) {
      message.error(
        response.data?.message ||
          "Không thể tải phiếu hoàn",
      );

      return null;
    }

    const detail =
      response.data
        .customer_return as CustomerReturnDetail;

    return {
      detail,
      items:
        normalizeArray<CustomerReturnItem>(
          response.data,
          ["items"],
        ),
      allocations:
        normalizeArray<CustomerReturnAllocation>(
          response.data,
          ["allocations"],
        ),
      totalQuantity: Number(
        response.data?.total_quantity ||
          0,
      ),
      totalRefund: Number(
        response.data?.total_refund || 0,
      ),
    };
  };


  const refreshCurrentReturn = async (
    returnId: number,
    saleId?: number,
  ) => {
    try {
      const value =
        await loadReturnDetail(
          returnId,
        );

      if (!value) {
        return;
      }

      setCurrentReturnDetail(
        value.detail,
      );

      const targetSaleId =
        saleId ||
        value.detail.sale_id;

      if (targetSaleId) {
        await loadReturnableItems(
          targetSaleId,
          returnId,
        );
      }
    } catch (error) {
      console.error(
        "Refresh current return:",
        error,
      );

      message.error(
        "Không thể tải lại phiếu hoàn",
      );
    }
  };


  /* =========================================================
     CREATE DRAFT
  ========================================================= */

  const handleCreateReturn = async (
    values: ReturnHeaderFormValues,
  ) => {
    if (!selectedSale) {
      message.warning(
        "Chưa chọn phiếu bán cần hoàn",
      );
      return;
    }

    try {
      setCreating(true);

      const response = await api.post(
        "/customer-returns",
        {
          sale_id: selectedSale.id,
          reason:
            values.reason.trim(),
          note:
            values.note?.trim() ||
            null,
        },
      );

      if (
        response.data?.success !== true
      ) {
        message.error(
          response.data?.message ||
            "Không thể tạo phiếu hoàn",
        );

        return;
      }

      const returnId =
        Number(
          response.data?.return_id,
        );

      if (
        !Number.isFinite(returnId) ||
        returnId <= 0
      ) {
        message.error(
          "Không nhận được ID phiếu hoàn hợp lệ",
        );

        return;
      }

      setCurrentReturnId(returnId);

      await refreshCurrentReturn(
        returnId,
        selectedSale.id,
      );

      await loadCustomerReturns(
        customer?.phone,
      );

      message.success(
        "Đã tạo phiếu hoàn. Hãy chọn số lượng thuốc hoàn.",
      );
    } catch (error) {
      console.error(
        "Create customer return:",
        error,
      );

      message.error(
        "Có lỗi khi tạo phiếu hoàn",
      );
    } finally {
      setCreating(false);
    }
  };


  /* =========================================================
     SAVE ITEM QUANTITIES
  ========================================================= */

  const handleSaveReturnItems = async () => {
    if (
      !currentReturnId ||
      !selectedSale ||
      !currentDraft
    ) {
      return;
    }

    const selectedItems =
      returnableItems.filter((item) => {
        const desired = Number(
          desiredQuantities[
            item.sale_item_id
          ] ?? 0,
        );

        return desired > 0;
      });

    if (selectedItems.length === 0) {
      message.warning(
        "Vui lòng nhập số lượng hoàn lớn hơn 0 cho ít nhất một thuốc",
      );
      return;
    }

    const invalidItem =
      returnableItems.find((item) => {
        const touched =
          returnQuantityTouched[
            item.sale_item_id
          ] === true;

        const desired = Number(
          desiredQuantities[
            item.sale_item_id
          ] ?? 0,
        );

        if (!touched && desired === 0) {
          return false;
        }

        const max = Number(
          item.remaining_returnable_quantity ||
            0,
        );

        return (
          !Number.isFinite(desired) ||
          desired <= 0 ||
          !Number.isInteger(desired) ||
          max <= 0 ||
          desired > max
        );
      });

    if (invalidItem) {
      const desired = Number(
        desiredQuantities[
          invalidItem.sale_item_id
        ] ?? 0,
      );

      const max = Number(
        invalidItem.remaining_returnable_quantity ||
          0,
      );

      const warning =
        getReturnQuantityWarning(
          desired,
          max,
        ) ||
        "Số lượng hoàn không hợp lệ";

      message.warning(
        `${invalidItem.medicine?.name || "Thuốc"}: ${warning}`,
      );

      return;
    }

    try {
      setSavingItems(true);

      for (
        const item of returnableItems
      ) {
        const desired =
          Number(
            desiredQuantities[
              item.sale_item_id
            ] || 0,
          );

        const current =
          Number(
            item.current_return_quantity ||
              0,
          );

        const max =
          Number(
            item.remaining_returnable_quantity ||
              0,
          );

        if (
          !Number.isInteger(desired) ||
          desired < 0
        ) {
          throw new Error(
            "Số lượng hoàn phải là số nguyên không âm",
          );
        }

        if (desired > max) {
          throw new Error(
            `${
              item.medicine?.name ||
              "Thuốc"
            }: tối đa được hoàn ${formatNumber(
              max,
            )}`,
          );
        }

        if (
          desired === current
        ) {
          continue;
        }

        if (
          desired === 0 &&
          item.current_return_item_id
        ) {
          const response =
            await api.delete(
              `/customer-returns/${currentReturnId}/items/${item.current_return_item_id}`,
            );

          if (
            response.data?.success !==
            true
          ) {
            throw new Error(
              response.data?.message ||
                "Không thể xóa thuốc khỏi phiếu hoàn",
            );
          }

          continue;
        }

        if (
          desired > 0 &&
          !item.current_return_item_id
        ) {
          const response =
            await api.post(
              `/customer-returns/${currentReturnId}/items`,
              {
                sale_item_id:
                  item.sale_item_id,
                quantity: desired,
              },
            );

          if (
            response.data?.success !==
            true
          ) {
            throw new Error(
              response.data?.message ||
                "Không thể thêm thuốc hoàn",
            );
          }

          continue;
        }

        if (
          desired > 0 &&
          item.current_return_item_id
        ) {
          const response =
            await api.put(
              `/customer-returns/${currentReturnId}/items/${item.current_return_item_id}`,
              {
                quantity: desired,
              },
            );

          if (
            response.data?.success !==
            true
          ) {
            throw new Error(
              response.data?.message ||
                "Không thể cập nhật số lượng hoàn",
            );
          }
        }
      }

      await refreshCurrentReturn(
        currentReturnId,
        selectedSale.id,
      );

      await loadCustomerReturns(
        customer?.phone,
      );

      message.success(
        "Đã lưu số lượng hoàn",
      );
    } catch (error) {
      console.error(
        "Save return items:",
        error,
      );

      message.error(
        error instanceof Error
          ? error.message
          : "Có lỗi khi lưu số lượng hoàn",
      );
    } finally {
      setSavingItems(false);
    }
  };


  /* =========================================================
     COMPLETE
  ========================================================= */

  const handleCompleteReturn = async () => {
    if (
      !currentReturnId ||
      !selectedSale ||
      !currentDraft
    ) {
      return;
    }

    if (savedReturnQuantity <= 0) {
      message.warning(
        "Phiếu hoàn chưa có thuốc",
      );
      return;
    }

    try {
      setCompleting(true);

      const response = await api.post(
        `/customer-returns/${currentReturnId}/complete`,
      );

      if (
        response.data?.success !== true
      ) {
        message.error(
          response.data?.message ||
            "Không thể hoàn tất phiếu hoàn",
        );

        return;
      }

      /*
       * Phiếu vừa chuyển từ DRAFT -> COMPLETED.
       * Không gọi refreshCurrentReturn() ở đây vì hàm đó
       * truyền return_id vào API returnable-items, trong khi
       * backend chỉ chấp nhận return_id còn ở trạng thái DRAFT.
       */

      const completedReturn =
        await loadReturnDetail(
          currentReturnId,
        );

      if (completedReturn) {
        setCurrentReturnDetail(
          completedReturn.detail,
        );
      }

      /*
       * Tải lại số lượng còn được hoàn ở cấp phiếu bán,
       * KHÔNG truyền return_id của phiếu đã hoàn tất.
       */
      await loadReturnableItems(
        selectedSale.id,
      );

      await loadCustomerReturns(
        customer?.phone,
      );

      /*
       * Cập nhật trạng thái nút "Chọn hoàn / Đã hoàn"
       * ngay sau khi hoàn tất.
       */
      await loadSaleReturnability(
        paidOrders,
      );

      message.success(
        "Hoàn thuốc thành công, tồn Kho bán đã được cập nhật",
      );
    } catch (error) {
      console.error(
        "Complete return:",
        error,
      );

      message.error(
        "Có lỗi khi hoàn tất hoàn thuốc",
      );
    } finally {
      setCompleting(false);
    }
  };


  /* =========================================================
     CANCEL
  ========================================================= */

  const handleCancelReturn = async () => {
    if (
      !currentReturnId ||
      !currentDraft
    ) {
      return;
    }

    try {
      setCancelling(true);

      const response = await api.post(
        `/customer-returns/${currentReturnId}/cancel`,
        {
          reason:
            "Hủy phiếu hoàn tại quầy",
        },
      );

      if (
        response.data?.success !== true
      ) {
        message.error(
          response.data?.message ||
            "Không thể hủy phiếu hoàn",
        );

        return;
      }

      await loadCustomerReturns(
        customer?.phone,
      );

      resetCurrentFlow();

      message.success(
        "Đã hủy phiếu hoàn",
      );
    } catch (error) {
      console.error(
        "Cancel return:",
        error,
      );

      message.error(
        "Có lỗi khi hủy phiếu hoàn",
      );
    } finally {
      setCancelling(false);
    }
  };


  /* =========================================================
     RESUME DRAFT
  ========================================================= */

  const handleResumeReturn = async (
    record: CustomerReturnSummary,
  ) => {
    if (
      !record.sale_id ||
      !record.customer_phone
    ) {
      return;
    }

    const normalized =
      normalizePhone(
        record.customer_phone,
      );

    setPhone(normalized);

    try {
      setLookupLoading(true);

      const historyResponse =
        await api.get(
          `/sales-customers/by-phone/${normalized}/purchase-history`,
          {
            params: {
              limit: 100,
            },
          },
        );

      if (
        historyResponse.data
          ?.success !== true ||
        historyResponse.data
          ?.found !== true
      ) {
        message.error(
          "Không thể tải khách hàng của phiếu hoàn",
        );

        return;
      }

      setCustomer(
        historyResponse.data
          .customer as CustomerProfile,
      );

      const orders =
        normalizeArray<PurchaseOrder>(
          historyResponse.data,
          ["orders"],
        );

      setPaidOrders(orders);

      const sale =
        orders.find(
          (order) =>
            order.id === record.sale_id,
        ) || {
          id: record.sale_id,
          sale_code:
            record.sale_code,
          status: "PAID",
        };

      setSelectedSale(sale);

      setCurrentReturnId(record.id);

      const value =
        await loadReturnDetail(
          record.id,
        );

      if (value) {
        setCurrentReturnDetail(
          value.detail,
        );

        returnForm.setFieldsValue({
          reason:
            value.detail.reason || "",
          note:
            value.detail.note || "",
        });
      }

      await loadReturnableItems(
        record.sale_id,
        record.id,
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (error) {
      console.error(
        "Resume return:",
        error,
      );

      message.error(
        "Không thể mở phiếu hoàn",
      );
    } finally {
      setLookupLoading(false);
    }
  };


  /* =========================================================
     DETAIL DRAWER
  ========================================================= */

  const handleViewDetail = async (
    returnId: number,
  ) => {
    try {
      setDrawerOpen(true);
      setDrawerLoading(true);

      const value =
        await loadReturnDetail(
          returnId,
        );

      if (!value) {
        setDrawerOpen(false);
        return;
      }

      setDrawerDetail(
        value.detail,
      );

      setDrawerItems(
        value.items,
      );

      setDrawerAllocations(
        value.allocations,
      );

      setDrawerTotalQuantity(
        value.totalQuantity,
      );

      setDrawerTotalRefund(
        value.totalRefund,
      );
    } catch (error) {
      console.error(
        "View return detail:",
        error,
      );

      message.error(
        "Không thể tải chi tiết phiếu hoàn",
      );

      setDrawerOpen(false);
    } finally {
      setDrawerLoading(false);
    }
  };


  /* =========================================================
     PRINT
  ========================================================= */

  const printReturn = async (
    returnId: number,
  ) => {
    try {
      const value =
        await loadReturnDetail(
          returnId,
        );

      if (!value) {
        return;
      }

      if (
        value.detail.status !==
        "COMPLETED"
      ) {
        message.warning(
          "Chỉ phiếu Đã hoàn mới được in",
        );
        return;
      }

      const popup = window.open(
        "",
        "_blank",
        "width=900,height=720",
      );

      if (!popup) {
        message.warning(
          "Trình duyệt đang chặn cửa sổ in",
        );
        return;
      }

      const rows = value.items
        .map(
          (item, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>
                ${item.medicine?.medicine_code || "-"}<br/>
                <strong>${item.medicine?.name || "-"}</strong>
                ${
                  item.medicine?.strength
                    ? `<br/>${item.medicine.strength}`
                    : ""
                }
              </td>
              <td style="text-align:right">${formatNumber(item.quantity)}</td>
              <td>${item.medicine?.unit || ""}</td>
              <td style="text-align:right">${formatMoney(item.unit_price)}</td>
              <td style="text-align:right">${formatMoney(item.line_refund)}</td>
            </tr>
          `,
        )
        .join("");

      popup.document.write(`
        <!doctype html>
        <html lang="vi">
          <head>
            <meta charset="utf-8" />
            <title>${value.detail.return_code || "Phiếu hoàn thuốc"}</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 32px;
                color: #111;
              }
              h1 {
                margin: 0 0 8px;
                text-align: center;
                font-size: 24px;
              }
              .sub {
                text-align: center;
                margin-bottom: 24px;
              }
              .grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px 28px;
                margin-bottom: 20px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 16px;
              }
              th, td {
                border: 1px solid #999;
                padding: 8px;
                vertical-align: top;
              }
              th {
                background: #f3f3f3;
              }
              .total {
                margin-top: 18px;
                text-align: right;
                font-size: 18px;
                font-weight: 700;
              }
              .sign {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 80px;
                margin-top: 48px;
                text-align: center;
              }
              @media print {
                button {
                  display: none;
                }
              }
            </style>
          </head>
          <body>
            <h1>PHIẾU HOÀN THUỐC KHÁCH HÀNG</h1>
            <div class="sub">VASD Pharmacy</div>

            <div class="grid">
              <div><strong>Mã phiếu hoàn:</strong> ${value.detail.return_code || "-"}</div>
              <div><strong>Ngày hoàn:</strong> ${formatDateTime(value.detail.completed_at)}</div>
              <div><strong>Phiếu bán:</strong> ${value.detail.sale_code || "-"}</div>
              <div><strong>Kho nhận lại:</strong> ${value.detail.warehouse?.name || "-"}</div>
              <div><strong>Khách hàng:</strong> ${value.detail.customer_name || "-"}</div>
              <div><strong>SĐT:</strong> ${value.detail.customer_phone || "-"}</div>
              <div style="grid-column:1/3"><strong>Lý do:</strong> ${value.detail.reason || "-"}</div>
              <div style="grid-column:1/3"><strong>Ghi chú:</strong> ${value.detail.note || "-"}</div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Thuốc</th>
                  <th>SL hoàn</th>
                  <th>ĐVT</th>
                  <th>Đơn giá</th>
                  <th>Giá trị hoàn</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>

            <div class="total">
              Tổng giá trị hoàn: ${formatMoney(value.totalRefund)}
            </div>

            <div class="sign">
              <div>
                <strong>Khách hàng</strong>
                <br/><br/><br/>
                ${value.detail.customer_name || ""}
              </div>
              <div>
                <strong>Người thực hiện</strong>
                <br/><br/><br/>
                ${value.detail.completed_by?.full_name || ""}
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

      popup.document.close();
    } catch (error) {
      console.error(
        "Print return:",
        error,
      );

      message.error(
        "Không thể in phiếu hoàn",
      );
    }
  };


  /* =========================================================
     TABLES
  ========================================================= */

  const orderColumns:
    TableColumnsType<PurchaseOrder> = [
      {
        title: "Mã phiếu",
        dataIndex: "sale_code",
        key: "sale_code",
        width: 175,
        render: (value) => (
          <Text strong>
            {value || "-"}
          </Text>
        ),
      },
      {
        title: "Ngày mua",
        key: "paid_at",
        width: 170,
        render: (_, record) =>
          formatDateTime(
            record.paid_at ||
              record.created_at,
          ),
      },
      {
        title: "Kho bán",
        key: "warehouse",
        width: 150,
        render: (_, record) =>
          record.warehouse?.name || "-",
      },
      {
        title: "Số loại",
        dataIndex: "item_count",
        key: "item_count",
        width: 90,
        align: "center",
      },
      {
        title: "Tổng tiền",
        dataIndex: "total_amount",
        key: "total_amount",
        width: 150,
        align: "right",
        render: (value) => (
          <Text strong>
            {formatMoney(value)}
          </Text>
        ),
      },
      {
        title: "Thuốc đã mua",
        key: "items",
        ellipsis: true,
        render: (_, record) =>
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
        title: "Thao tác",
        key: "action",
        fixed: "right",
        width: 130,
        render: (_, record) => {
          const remaining =
            saleReturnability[
              record.id
            ];

          const fullyReturned =
            remaining !== undefined &&
            remaining <= 0;

          return (
            <Button
              type={
                selectedSale?.id ===
                record.id &&
              !fullyReturned
                  ? "primary"
                  : "default"
              }
              disabled={
                fullyReturned
              }
              onClick={() =>
                void handleSelectSale(
                  record,
                )
              }
            >
              {fullyReturned
                ? "Đã hoàn"
                : "Chọn hoàn"}
            </Button>
          );
        },
      },
    ];


  const getReturnQuantityWarning = (
    rawValue: number | null | undefined,
    max: number,
  ): string | null => {
    if (
      rawValue === null ||
      rawValue === undefined
    ) {
      return "Vui lòng nhập số lượng";
    }

    const quantity = Number(rawValue);

    if (!Number.isFinite(quantity)) {
      return "Số lượng không hợp lệ";
    }

    if (quantity <= 0) {
      return "Số lượng phải lớn hơn 0";
    }

    if (!Number.isInteger(quantity)) {
      return "Số lượng phải là số nguyên";
    }

    if (max <= 0) {
      return "Thuốc này không còn số lượng được hoàn";
    }

    if (quantity > max) {
      return `Số lượng vượt quá số lượng còn được hoàn. Tối đa ${formatNumber(
        max,
      )}`;
    }

    return null;
  };


  const returnableColumns:
    TableColumnsType<ReturnableItem> = [
      {
        title: "Thuốc",
        key: "medicine",
        width: 260,
        render: (_, record) => (
          <div>
            <Text strong>
              {record.medicine
                ?.medicine_code || "-"}
            </Text>

            <br />

            <Text>
              {record.medicine?.name ||
                "-"}
            </Text>

            {record.medicine
              ?.strength && (
              <>
                <br />

                <Text type="secondary">
                  {
                    record.medicine
                      .strength
                  }
                </Text>
              </>
            )}
          </div>
        ),
      },
      {
        title: "ID lô",
        key: "batch_ids",
        width: 110,
        align: "center",
        render: (_, record) => {
          const batchIds =
            saleAllocationBatchMap[
              record.sale_item_id
            ] || [];

          if (
            batchIds.length === 0
          ) {
            return (
              <Text type="secondary">
                -
              </Text>
            );
          }

          return (
            <Space
              size={[2, 2]}
              wrap
            >
              {batchIds.map(
                (batchId) => (
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
                ),
              )}
            </Space>
          );
        },
      },
      {
        title: "Đã mua",
        dataIndex:
          "purchased_quantity",
        key: "purchased_quantity",
        width: 100,
        align: "right",
        render: (value) =>
          formatNumber(value),
      },
      {
        title: "Đã hoàn",
        dataIndex:
          "completed_return_quantity",
        key: "completed_return_quantity",
        width: 100,
        align: "right",
        render: (value) =>
          formatNumber(value),
      },
      {
        title: "Phiếu nháp khác giữ",
        dataIndex:
          "reserved_in_other_drafts",
        key: "reserved_in_other_drafts",
        width: 135,
        align: "right",
        render: (value) =>
          formatNumber(value),
      },
      {
        title: "Còn được hoàn",
        dataIndex:
          "remaining_returnable_quantity",
        key:
          "remaining_returnable_quantity",
        width: 125,
        align: "right",
        render: (value) => (
          <Text strong>
            {formatNumber(value)}
          </Text>
        ),
      },
      {
        title: "Đơn giá",
        dataIndex: "unit_price",
        key: "unit_price",
        width: 130,
        align: "right",
        render: (value) =>
          formatMoney(value),
      },
      {
        title: "SL hoàn phiếu này",
        key: "desired",
        fixed: "right",
        width: 220,
        render: (_, record) => {
          const max =
            Number(
              record.remaining_returnable_quantity ||
                0,
            );

          const currentValue =
            desiredQuantities[
              record.sale_item_id
            ] ?? 0;

          const touched =
            returnQuantityTouched[
              record.sale_item_id
            ] === true;

          const warning =
            getReturnQuantityWarning(
              currentValue,
              max,
            );

          const showError =
            touched && warning !== null;

          return (
            <Space
              direction="vertical"
              size={2}
              style={{
                width: "100%",
              }}
            >
              <InputNumber
                disabled={!currentDraft || max <= 0}
                value={
                  currentValue > 0
                    ? currentValue
                    : null
                }
                placeholder={
                  max > 0
                    ? `Tối đa ${formatNumber(max)}`
                    : "Không còn được hoàn"
                }
                status={
                  showError
                    ? "error"
                    : undefined
                }
                style={{
                  width: "100%",
                }}
                onChange={(value) => {
                  const quantity =
                    value === null
                      ? 0
                      : Number(value);

                  setDesiredQuantities(
                    (current) => ({
                      ...current,
                      [record.sale_item_id]:
                        quantity,
                    }),
                  );

                  setReturnQuantityTouched(
                    (current) => ({
                      ...current,
                      [record.sale_item_id]:
                        true,
                    }),
                  );
                }}
              />

              {showError && (
                <Text
                  type="danger"
                  style={{
                    fontSize: 12,
                  }}
                >
                  {warning}
                </Text>
              )}

              {!showError &&
                currentDraft &&
                max > 0 && (
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 12,
                    }}
                  >
                    Nhập số nguyên từ 1 đến{" "}
                    {formatNumber(max)}
                  </Text>
                )}
            </Space>
          );
        },
      },
    ];


  const returnListColumns:
    TableColumnsType<CustomerReturnSummary> =
      [
        {
          title: "Mã hoàn",
          dataIndex: "return_code",
          key: "return_code",
          width: 175,
          render: (value) => (
            <Text strong>
              {value || "-"}
            </Text>
          ),
        },
        {
          title: "Phiếu bán",
          dataIndex: "sale_code",
          key: "sale_code",
          width: 175,
        },
        {
          title: "ID lô",
          key: "batch_ids",
          width: 115,
          align: "center",
          render: (_, record) => {
            const batchIds =
              returnBatchMap[
                record.id
              ] || [];

            if (
              batchIds.length === 0
            ) {
              return (
                <Text type="secondary">
                  -
                </Text>
              );
            }

            return (
              <Space
                size={[2, 2]}
                wrap
              >
                {batchIds.map(
                  (batchId) => (
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
                  ),
                )}
              </Space>
            );
          },
        },
        {
          title: "Khách hàng",
          key: "customer",
          width: 210,
          render: (_, record) => (
            <div>
              <Text>
                {record.customer_name ||
                  "-"}
              </Text>
              <br />
              <Text type="secondary">
                {record.customer_phone ||
                  "-"}
              </Text>
            </div>
          ),
        },
        {
          title: "Trạng thái",
          dataIndex: "status",
          key: "status",
          width: 120,
          render: (value) => (
            <Tag
              color={getReturnStatusColor(
                value,
              )}
            >
              {getReturnStatusLabel(
                value,
              )}
            </Tag>
          ),
        },
        {
          title: "SL hoàn",
          dataIndex:
            "total_quantity",
          key: "total_quantity",
          width: 100,
          align: "right",
          render: (value) =>
            formatNumber(value),
        },
        {
          title: "Giá trị hoàn",
          dataIndex:
            "total_refund",
          key: "total_refund",
          width: 145,
          align: "right",
          render: (value) =>
            formatMoney(value),
        },
        {
          title: "Ngày",
          key: "date",
          width: 165,
          render: (_, record) =>
            formatDateTime(
              record.completed_at ||
                record.created_at,
            ),
        },
        {
          title: "Thao tác",
          key: "actions",
          fixed: "right",
          width: 220,
          render: (_, record) => (
            <Space>
              {record.status ===
                "DRAFT" && (
                <Button
                  type="primary"
                  onClick={() =>
                    void handleResumeReturn(
                      record,
                    )
                  }
                >
                  Tiếp tục
                </Button>
              )}

              <Button
                icon={<EyeOutlined />}
                onClick={() =>
                  void handleViewDetail(
                    record.id,
                  )
                }
              >
                Xem
              </Button>

              {record.status ===
                "COMPLETED" && (
                <Button
                  icon={
                    <PrinterOutlined />
                  }
                  onClick={() =>
                    void printReturn(
                      record.id,
                    )
                  }
                >
                  In
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
          justifyContent:
            "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <Title
            level={3}
            style={{ marginBottom: 4 }}
          >
            Hoàn thuốc khách hàng
          </Title>

          <Text type="secondary">
            Hoàn thuốc theo SĐT và phiếu
            bán đã thanh toán, kiểm soát
            số lượng hoàn theo từng lô gốc.
          </Text>
        </div>

        <Button
          icon={<ReloadOutlined />}
          onClick={() =>
            void loadCustomerReturns(
              customer?.phone,
            )
          }
        >
          Làm mới
        </Button>
      </div>

      <Alert
        showIcon
        type="warning"
        style={{ marginBottom: 16 }}
        message="Kiểm tra tình trạng thuốc trước khi hoàn tất"
        description="Theo workflow hiện tại, khi bấm Hoàn tất hoàn thuốc, số lượng sẽ được cộng trực tiếp về đúng Kho bán và đúng lô đã xuất. Không hoàn tất nếu thuốc không đủ điều kiện nhập lại kho."
      />

      <Card
        title="1. Tra cứu khách hàng bằng SĐT"
        style={{ marginBottom: 16 }}
      >
        <Row gutter={16}>
          <Col xs={24} md={14}>
            <Input.Search
              value={phone}
              maxLength={10}
              allowClear
              enterButton={
                <Space>
                  <SearchOutlined />
                  Tìm khách hàng
                </Space>
              }
              loading={lookupLoading}
              placeholder="Nhập đủ 10 số, ví dụ 0914989572"
              onChange={(event) =>
                setPhone(
                  normalizePhone(
                    event.target.value,
                  ),
                )
              }
              onSearch={() =>
                void handleLookupCustomer()
              }
            />
          </Col>
        </Row>

        {customer && (
          <Card
            size="small"
            style={{ marginTop: 16 }}
          >
            <Descriptions
              size="small"
              column={{
                xs: 1,
                sm: 2,
                lg: 4,
              }}
            >
              <Descriptions.Item label="Họ tên">
                <Text strong>
                  {customer.full_name || "-"}
                </Text>
              </Descriptions.Item>

              <Descriptions.Item label="SĐT">
                {customer.phone || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Ngày sinh / Tuổi">
                {customer.birth_date
                  ? `${formatDate(
                      customer.birth_date,
                    )}${
                      customer.age !==
                        null &&
                      customer.age !==
                        undefined
                        ? ` (${customer.age} tuổi)`
                        : ""
                    }`
                  : "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Địa chỉ">
                {customer.address || "-"}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        )}
      </Card>

      {customer && (
        <Card
          title="2. Chọn phiếu bán cần hoàn"
          style={{ marginBottom: 16 }}
        >
          <Table
            rowKey="id"
            columns={orderColumns}
            dataSource={paidOrders}
            pagination={{
              pageSize: 5,
              hideOnSinglePage: true,
            }}
            scroll={{ x: 1100 }}
            locale={{
              emptyText:
                "Khách hàng chưa có phiếu PAID",
            }}
          />
        </Card>
      )}

      {selectedSale && (
        <Card
          title={`3. Phiếu bán ${
            selectedSale.sale_code ||
            `#${selectedSale.id}`
          }`}
          style={{ marginBottom: 16 }}
          loading={returnableLoading}
        >
          {!currentReturnId ? (
            <Form
              form={returnForm}
              layout="vertical"
              requiredMark={false}
              onFinish={
                handleCreateReturn
              }
            >
              <Row gutter={16}>
                <Col xs={24} lg={14}>
                  <Form.Item
                    label="Lý do hoàn thuốc"
                    name="reason"
                    rules={[
                      {
                        required: true,
                        whitespace: true,
                        message:
                          "Vui lòng nhập lý do hoàn thuốc",
                      },
                    ]}
                  >
                    <Input
                      maxLength={500}
                      placeholder="Ví dụ: Khách mua nhầm số lượng"
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} lg={10}>
                  <Form.Item
                    label="Ghi chú"
                    name="note"
                  >
                    <Input
                      maxLength={500}
                      placeholder="Ghi chú nếu có"
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Button
                type="primary"
                icon={<RollbackOutlined />}
                loading={creating}
                htmlType="submit"
              >
                Tạo phiếu hoàn
              </Button>
            </Form>
          ) : (
            <Alert
              showIcon
              type={
                currentCompleted
                  ? "success"
                  : "info"
              }
              message={
                <Space>
                  <Text strong>
                    {currentReturnDetail
                      ?.return_code ||
                      `Phiếu #${currentReturnId}`}
                  </Text>

                  <Tag
                    color={getReturnStatusColor(
                      currentReturnDetail?.status,
                    )}
                  >
                    {getReturnStatusLabel(
                      currentReturnDetail?.status,
                    )}
                  </Tag>
                </Space>
              }
              description={
                <>
                  <div>
                    Lý do:{" "}
                    {currentReturnDetail
                      ?.reason || "-"}
                  </div>

                  {currentReturnDetail
                    ?.note && (
                    <div>
                      Ghi chú:{" "}
                      {
                        currentReturnDetail
                          .note
                      }
                    </div>
                  )}
                </>
              }
            />
          )}

          <Divider />

          <Table
            rowKey="sale_item_id"
            columns={returnableColumns}
            dataSource={returnableItems}
            pagination={false}
            scroll={{ x: 1320 }}
          />

          {currentDraft && (
            <>
              <Row
                gutter={[16, 16]}
                style={{
                  marginTop: 16,
                }}
              >
                <Col xs={24} sm={8}>
                  <Card size="small">
                    <Statistic
                      title="Đang lưu trong phiếu"
                      value={
                        savedReturnQuantity
                      }
                    />
                  </Card>
                </Col>

                <Col xs={24} sm={8}>
                  <Card size="small">
                    <Statistic
                      title="Số lượng đang chọn"
                      value={
                        desiredReturnQuantity
                      }
                    />
                  </Card>
                </Col>

                <Col xs={24} sm={8}>
                  <Card size="small">
                    <Statistic
                      title="Giá trị hoàn dự kiến"
                      value={
                        desiredRefundAmount
                      }
                      formatter={(value) =>
                        formatMoney(
                          Number(value),
                        )
                      }
                    />
                  </Card>
                </Col>
              </Row>

              <Space
                wrap
                style={{
                  marginTop: 16,
                }}
              >
                <Button
                  type="primary"
                  loading={savingItems}
                  onClick={() =>
                    void handleSaveReturnItems()
                  }
                >
                  Lưu số lượng hoàn
                </Button>

                <Popconfirm
                  title="Hoàn tất hoàn thuốc?"
                  description="Hệ thống sẽ cộng thuốc về đúng Kho bán và đúng các lô đã xuất. Thao tác này không thể sửa lại."
                  okText="Hoàn tất"
                  cancelText="Hủy"
                  onConfirm={() =>
                    void handleCompleteReturn()
                  }
                >
                  <Button
                    type="primary"
                    icon={
                      <CheckCircleOutlined />
                    }
                    loading={completing}
                    disabled={
                      savedReturnQuantity <=
                      0
                    }
                  >
                    Hoàn tất hoàn thuốc
                  </Button>
                </Popconfirm>

                <Popconfirm
                  title="Hủy phiếu hoàn?"
                  description="Số lượng đang giữ trong phiếu nháp sẽ được giải phóng."
                  okText="Hủy phiếu"
                  cancelText="Không"
                  onConfirm={() =>
                    void handleCancelReturn()
                  }
                >
                  <Button
                    danger
                    icon={<StopOutlined />}
                    loading={cancelling}
                  >
                    Hủy phiếu
                  </Button>
                </Popconfirm>
              </Space>
            </>
          )}

          {currentCompleted && (
            <Space
              style={{
                marginTop: 16,
              }}
            >
              <Alert
                showIcon
                type="success"
                message="Phiếu đã hoàn tất. Tồn kho đã được cộng lại."
              />

              {currentReturnId && (
                <Button
                  type="primary"
                  icon={
                    <PrinterOutlined />
                  }
                  onClick={() =>
                    void printReturn(
                      currentReturnId,
                    )
                  }
                >
                  In phiếu hoàn
                </Button>
              )}
            </Space>
          )}
        </Card>
      )}

      <Card title="Lịch sử phiếu hoàn khách hàng">
        <Table
          rowKey="id"
          columns={returnListColumns}
          dataSource={customerReturns}
          loading={returnListLoading}
          scroll={{ x: 1300 }}
          pagination={{
            pageSize: 10,
            showTotal: (total) =>
              `Tổng ${total} phiếu hoàn`,
          }}
        />
      </Card>

      <Drawer
        title={
          drawerDetail
            ? `Chi tiết ${
                drawerDetail.return_code ||
                ""
              }`
            : "Chi tiết phiếu hoàn"
        }
        open={drawerOpen}
        width={860}
        loading={drawerLoading}
        destroyOnHidden
        onClose={() => {
          setDrawerOpen(false);
          setDrawerDetail(null);
          setDrawerItems([]);
          setDrawerAllocations([]);
        }}
        extra={
          drawerDetail?.status ===
          "COMPLETED" ? (
            <Button
              icon={<PrinterOutlined />}
              onClick={() =>
                void printReturn(
                  drawerDetail.id,
                )
              }
            >
              In phiếu
            </Button>
          ) : null
        }
      >
        {drawerDetail && (
          <>
            <Descriptions
              bordered
              size="small"
              column={1}
            >
              <Descriptions.Item label="Mã phiếu hoàn">
                {
                  drawerDetail.return_code
                }
              </Descriptions.Item>

              <Descriptions.Item label="Phiếu bán">
                {
                  drawerDetail.sale_code
                }
              </Descriptions.Item>

              <Descriptions.Item label="Khách hàng">
                {drawerDetail.customer_name ||
                  "-"}{" "}
                -{" "}
                {drawerDetail.customer_phone ||
                  "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Kho nhận lại">
                {drawerDetail.warehouse
                  ?.name || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Trạng thái">
                <Tag
                  color={getReturnStatusColor(
                    drawerDetail.status,
                  )}
                >
                  {getReturnStatusLabel(
                    drawerDetail.status,
                  )}
                </Tag>
              </Descriptions.Item>

              <Descriptions.Item label="Lý do">
                {drawerDetail.reason || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Ghi chú">
                {drawerDetail.note || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Ngày tạo">
                {formatDateTime(
                  drawerDetail.created_at,
                )}
              </Descriptions.Item>

              <Descriptions.Item label="Ngày hoàn tất">
                {formatDateTime(
                  drawerDetail.completed_at,
                )}
              </Descriptions.Item>
            </Descriptions>

            <Title
              level={5}
              style={{
                marginTop: 24,
              }}
            >
              Thuốc hoàn
            </Title>

            <Table
              rowKey={(record) =>
                String(
                  record.id ||
                    record.sale_item_id,
                )
              }
              dataSource={drawerItems}
              pagination={false}
              columns={[
                {
                  title: "Thuốc",
                  key: "medicine",
                  render: (
                    _,
                    record,
                  ) => (
                    <div>
                      <Text strong>
                        {record.medicine
                          ?.medicine_code ||
                          "-"}
                      </Text>
                      <br />
                      <Text>
                        {record.medicine
                          ?.name || "-"}
                      </Text>
                    </div>
                  ),
                },
                {
                  title: "SL hoàn",
                  dataIndex: "quantity",
                  key: "quantity",
                  align:
                    "right" as const,
                  render: (value) =>
                    formatNumber(value),
                },
                {
                  title: "Đơn giá",
                  dataIndex: "unit_price",
                  key: "unit_price",
                  align:
                    "right" as const,
                  render: (value) =>
                    formatMoney(value),
                },
                {
                  title: "Giá trị",
                  dataIndex: "line_refund",
                  key: "line_refund",
                  align:
                    "right" as const,
                  render: (value) =>
                    formatMoney(value),
                },
              ]}
            />

            <Row
              gutter={16}
              style={{ marginTop: 16 }}
            >
              <Col xs={24} sm={12}>
                <Statistic
                  title="Tổng số lượng hoàn"
                  value={
                    drawerTotalQuantity
                  }
                />
              </Col>

              <Col xs={24} sm={12}>
                <Statistic
                  title="Tổng giá trị hoàn"
                  value={
                    drawerTotalRefund
                  }
                  formatter={(value) =>
                    formatMoney(
                      Number(value),
                    )
                  }
                />
              </Col>
            </Row>

            {drawerAllocations.length >
              0 && (
              <>
                <Title
                  level={5}
                  style={{
                    marginTop: 24,
                  }}
                >
                  Phân bổ lô hoàn
                </Title>

                <Table
                  rowKey={(record) =>
                    String(record.id)
                  }
                  dataSource={
                    drawerAllocations
                  }
                  pagination={false}
                  columns={[
                    {
                      title: "Lô",
                      dataIndex:
                        "lot_number",
                      key: "lot_number",
                    },
                    {
                      title: "HSD",
                      dataIndex:
                        "expiry_date",
                      key: "expiry_date",
                      render: (value) =>
                        formatDate(value),
                    },
                    {
                      title: "Số lượng",
                      dataIndex:
                        "quantity",
                      key: "quantity",
                      align:
                        "right" as const,
                      render: (value) =>
                        formatNumber(
                          value,
                        ),
                    },
                  ]}
                />
              </>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}

export default CustomerReturns;
