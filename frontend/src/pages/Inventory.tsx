import { useEffect, useMemo, useState } from "react";

import { useSearchParams } from "react-router-dom";

import {
  Alert,
  Button,
  Card,
  Input,
  Popover,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";

import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";

import dayjs from "dayjs";

import api from "../api/api";

const { Title, Text } = Typography;

/* =========================================================
   TYPES
========================================================= */

interface InventoryItem {
  id?: number;

  /* =========================
     WAREHOUSE
  ========================= */

  warehouse_id?: number;

  warehouse_code?: string;

  warehouse_name?: string;

  warehouse_type?: string;

  warehouse?: {
    id?: number;

    warehouse_code?: string;

    code?: string;

    warehouse_name?: string;

    name?: string;

    warehouse_type?: string;

    type?: string;
  };

  /* =========================
     MEDICINE
  ========================= */

  medicine_id?: number;

  medicine_code?: string;

  medicine_name?: string;

  strength?: string | null;

  unit?: string | null;

  medicine?: {
    id?: number;

    medicine_code?: string;

    code?: string;

    name?: string;

    medicine_name?: string;

    active_ingredient?: string | null;

    strength?: string | null;

    unit?: string | null;
  };

  /* =========================
     BATCH
  ========================= */

  batch_id?: number;

  lot_number?: string;

  expiry_date?: string | null;

  batch?: {
    id?: number;

    lot_number?: string;

    expiry_date?: string | null;
  };

  /* =========================
     STOCK
  ========================= */

  quantity?: number | string;

  stock_quantity?: number | string;

  physical_quantity?: number | string;
  reserved_quantity?: number | string;
  available_quantity?: number | string;

  updated_at?: string | null;
}

interface StockReservation {
  id?: number;
  reference_type?: string;
  reference_id?: number;
  reference_item_id?: number | null;

  warehouse_id?: number;
  warehouse_code?: string;
  warehouse_name?: string;

  batch_id?: number;
  lot_number?: string | null;
  expiry_date?: string | null;

  medicine_id?: number;
  medicine_code?: string;
  medicine_name?: string;
  unit?: string | null;

  quantity?: number | string;
  status?: string;

  created_at?: string | null;
  note?: string | null;
}

/* =========================================================
   COMPONENT
========================================================= */

function Inventory() {
  const [searchParams, setSearchParams] = useSearchParams();

  const batchIdParam = useMemo(() => {
    const raw = searchParams.get("batch_id");

    if (!raw) {
      return undefined;
    }

    const value = Number(raw);

    return Number.isInteger(value) && value > 0
      ? value
      : undefined;
  }, [searchParams]);

  /* =========================================================
     STATE
  ========================================================= */

  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  const [reservations, setReservations] =
    useState<StockReservation[]>([]);

  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");

  const [warehouseFilter, setWarehouseFilter] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (batchIdParam) {
      setSearch(`#${batchIdParam}`);
      setWarehouseFilter(undefined);
    }
  }, [batchIdParam]);

  /* =========================================================
     HELPERS - WAREHOUSE
  ========================================================= */

  const getWarehouseId = (item: InventoryItem) => {
    return item.warehouse?.id ?? item.warehouse_id;
  };

  const getWarehouseName = (item: InventoryItem) => {
    return (
      item.warehouse?.name ||
      item.warehouse?.warehouse_name ||
      item.warehouse_name ||
      "-"
    );
  };

  const getWarehouseCode = (item: InventoryItem) => {
    return (
      item.warehouse?.code ||
      item.warehouse?.warehouse_code ||
      item.warehouse_code ||
      "-"
    );
  };

  const getWarehouseType = (item: InventoryItem) => {
    return (
      item.warehouse?.type ||
      item.warehouse?.warehouse_type ||
      item.warehouse_type ||
      ""
    );
  };

  /* =========================================================
     HELPERS - MEDICINE
  ========================================================= */

  const getMedicineId = (item: InventoryItem) => {
    return item.medicine?.id ?? item.medicine_id;
  };

  const getMedicineCode = (item: InventoryItem) => {
    return (
      item.medicine?.medicine_code ||
      item.medicine?.code ||
      item.medicine_code ||
      "-"
    );
  };

  const getMedicineName = (item: InventoryItem) => {
    return (
      item.medicine?.name ||
      item.medicine?.medicine_name ||
      item.medicine_name ||
      "-"
    );
  };

  const getMedicineStrength = (item: InventoryItem) => {
    return item.medicine?.strength || item.strength || "";
  };

  const getUnit = (item: InventoryItem) => {
    return item.medicine?.unit || item.unit || "";
  };

  /* =========================================================
     HELPERS - BATCH
  ========================================================= */

  const getBatchId = (item: InventoryItem) => {
    return item.batch?.id ?? item.batch_id;
  };

  const getLotNumber = (item: InventoryItem) => {
    return item.batch?.lot_number || item.lot_number || "-";
  };

  const getExpiryDate = (item: InventoryItem) => {
    return item.batch?.expiry_date || item.expiry_date || null;
  };

  /* =========================================================
     HELPERS - QUANTITY
  ========================================================= */

  const getPhysicalQuantity = (item: InventoryItem) => {
    const value = Number(
      item.physical_quantity ??
        item.quantity ??
        item.stock_quantity ??
        0,
    );

    return Number.isFinite(value) ? value : 0;
  };

  const getReservedQuantity = (item: InventoryItem) => {
    const value = Number(item.reserved_quantity ?? 0);

    return Number.isFinite(value) ? value : 0;
  };

  const getAvailableQuantity = (item: InventoryItem) => {
    if (
      item.available_quantity !== undefined &&
      item.available_quantity !== null
    ) {
      const value = Number(item.available_quantity);

      return Number.isFinite(value)
        ? Math.max(0, value)
        : 0;
    }

    return Math.max(
      0,
      getPhysicalQuantity(item) -
        getReservedQuantity(item),
    );
  };

  const normalizeReservations = (
    data: unknown,
  ): StockReservation[] => {
    if (
      typeof data !== "object" ||
      data === null
    ) {
      return [];
    }

    const value = data as {
      data?: unknown;
      reservations?: unknown;
      stock_reservations?: unknown;
    };

    if (Array.isArray(value.data)) {
      return value.data;
    }

    if (Array.isArray(value.reservations)) {
      return value.reservations;
    }

    if (
      Array.isArray(
        value.stock_reservations,
      )
    ) {
      return value.stock_reservations;
    }

    return [];
  };

  const getReservationTypeLabel = (
    type?: string,
  ) => {
    switch (type) {
      case "SALES_ORDER":
        return "Bán thuốc";

      case "WAREHOUSE_TRANSFER":
        return "Chuyển kho";

      case "SUPPLIER_RETURN":
        return "Trả NCC";

      default:
        return type || "Nghiệp vụ khác";
    }
  };

  const getActiveReservationsForRow = (
    item: InventoryItem,
  ) => {
    const warehouseId =
      getWarehouseId(item);

    const batchId = getBatchId(item);

    return reservations.filter(
      (reservation) =>
        reservation.status === "ACTIVE" &&
        Number(reservation.warehouse_id) ===
          Number(warehouseId) &&
        Number(reservation.batch_id) ===
          Number(batchId),
    );
  };

  /* =========================================================
     NORMALIZE API RESPONSE
  ========================================================= */

  const normalizeInventory = (data: unknown): InventoryItem[] => {
    if (typeof data !== "object" || data === null) {
      return [];
    }

    const value = data as {
      data?: unknown;

      inventory?: unknown;
    };

    if (Array.isArray(value.data)) {
      return value.data;
    }

    if (Array.isArray(value.inventory)) {
      return value.inventory;
    }

    return [];
  };

  /* =========================================================
     LOAD INVENTORY
  ========================================================= */

  const loadInventory = async () => {
    try {
      setLoading(true);

      const [
        inventoryResponse,
        reservationResponse,
      ] = await Promise.all([
        api.get("/inventory/availability"),
        api.get("/stock-reservations", {
          params: {
            status: "ACTIVE",
          },
        }),
      ]);

      const data = inventoryResponse.data;

      if (data?.success !== true) {
        message.error(
          data?.message ||
            "Không thể tải tồn kho",
        );

        return;
      }

      const result =
        normalizeInventory(data);

      setInventory(result);

      if (
        reservationResponse.data?.success ===
        true
      ) {
        setReservations(
          normalizeReservations(
            reservationResponse.data,
          ),
        );
      } else {
        setReservations([]);
      }
    } catch (error) {
      console.error("Load inventory:", error);

      message.error("Không thể tải dữ liệu tồn kho");
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     INITIAL LOAD
  ========================================================= */

  useEffect(() => {
    void loadInventory();
  }, []);

  /* =========================================================
     ACTIVE INVENTORY
     Chỉ hiển thị các lô còn tồn > 0
  ========================================================= */

  const activeInventory = useMemo(() => {
    return inventory.filter(
      (item) => getPhysicalQuantity(item) > 0,
    );
  }, [inventory]);

  /* =========================================================
     FILTER
  ========================================================= */

  const filteredInventory = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    /*
     * Quy ước tìm kiếm:
     *
     * #21  -> tìm CHÍNH XÁC ID lô 21
     * 21   -> tìm tự do trong mã/tên/số lô...
     *
     * Như vậy #2 sẽ không còn khớp #20, #21, #24...
     */
    const exactBatchMatch = keyword.match(/^#(\d+)$/);

    const exactBatchId = exactBatchMatch
      ? Number(exactBatchMatch[1])
      : undefined;

    return activeInventory.filter((item) => {
      if (
        batchIdParam !== undefined &&
        getBatchId(item) !== batchIdParam
      ) {
        return false;
      }

      /* =========================
             FILTER WAREHOUSE
          ========================= */

      const warehouseType = getWarehouseType(item);

      if (warehouseFilter && warehouseType !== warehouseFilter) {
        return false;
      }

      /* =========================
             NO SEARCH
          ========================= */

      if (!keyword) {
        return true;
      }

      /* =========================
             EXACT BATCH ID
          ========================= */

      if (exactBatchId !== undefined) {
        return getBatchId(item) === exactBatchId;
      }

      /* =========================
             SEARCH CONTENT
          ========================= */

      const batchId = getBatchId(item);

      const searchableText = [
        batchId,

        getMedicineId(item),

        getMedicineCode(item),

        getMedicineName(item),

        getMedicineStrength(item),

        getLotNumber(item),

        getWarehouseName(item),

        getWarehouseCode(item),
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(keyword);
    });
  }, [activeInventory, search, warehouseFilter, batchIdParam]);

  const filteredBatchCount = useMemo(() => {
    const ids = new Set<number>();

    filteredInventory.forEach((item) => {
      const batchId = getBatchId(item);

      if (batchId !== undefined) {
        ids.add(batchId);
      }
    });

    return ids.size;
  }, [filteredInventory]);

  /* =========================================================
     SUMMARY
  ========================================================= */

  /*
   * SỐ LOẠI THUỐC
   *
   * unique theo medicine_id
   *
   * Ví dụ:
   * Paracetamol có 4 batch
   * vẫn chỉ tính 1 loại thuốc
   */

  const medicineCount = useMemo(() => {
    const ids = new Set<number>();

    activeInventory.forEach((item) => {
      const medicineId = getMedicineId(item);

      if (medicineId !== undefined) {
        ids.add(medicineId);
      }
    });

    return ids.size;
  }, [activeInventory]);

  /*
   * SỐ LÔ
   *
   * unique theo batch_id
   *
   * Nếu cùng batch nằm ở
   * Kho chính + Kho bán
   * vẫn chỉ tính là 1 lô.
   */

  const batchCount = useMemo(() => {
    const ids = new Set<number>();

    activeInventory.forEach((item) => {
      const batchId = getBatchId(item);

      if (batchId !== undefined) {
        ids.add(batchId);
      }
    });

    return ids.size;
  }, [activeInventory]);

  /*
   * TỔNG TỒN
   */

  const totalQuantity = useMemo(() => {
    return activeInventory.reduce(
      (total, item) => total + getPhysicalQuantity(item),
      0,
    );
  }, [activeInventory]);

  const totalReservedQuantity = useMemo(() => {
    return activeInventory.reduce(
      (total, item) =>
        total + getReservedQuantity(item),
      0,
    );
  }, [activeInventory]);

  const totalAvailableQuantity = useMemo(() => {
    return activeInventory.reduce(
      (total, item) =>
        total + getAvailableQuantity(item),
      0,
    );
  }, [activeInventory]);

  /*
   * KHO CHÍNH
   */

  const mainWarehouseTotal = useMemo(() => {
    return activeInventory
      .filter((item) => getWarehouseType(item) === "MAIN")
      .reduce((total, item) => total + getPhysicalQuantity(item), 0);
  }, [activeInventory]);

  /*
   * KHO BÁN
   */

  const saleWarehouseTotal = useMemo(() => {
    return activeInventory
      .filter((item) => getWarehouseType(item) === "SALE")
      .reduce((total, item) => total + getPhysicalQuantity(item), 0);
  }, [activeInventory]);

  /*
   * SỐ LOẠI THUỐC KHO CHÍNH
   */

  const mainWarehouseMedicineCount = useMemo(() => {
    const ids = new Set<number>();

    activeInventory
      .filter((item) => getWarehouseType(item) === "MAIN")
      .forEach((item) => {
        const medicineId = getMedicineId(item);

        if (medicineId !== undefined) {
          ids.add(medicineId);
        }
      });

    return ids.size;
  }, [activeInventory]);

  /*
   * SỐ LOẠI THUỐC KHO BÁN
   */

  const saleWarehouseMedicineCount = useMemo(() => {
    const ids = new Set<number>();

    activeInventory
      .filter((item) => getWarehouseType(item) === "SALE")
      .forEach((item) => {
        const medicineId = getMedicineId(item);

        if (medicineId !== undefined) {
          ids.add(medicineId);
        }
      });

    return ids.size;
  }, [activeInventory]);

  /* =========================================================
     EXPIRY STATUS
  ========================================================= */

  const renderExpiryStatus = (expiryValue: string | null) => {
    if (!expiryValue) {
      return <Tag>Không có HSD</Tag>;
    }

    const expiry = dayjs(expiryValue);

    if (!expiry.isValid()) {
      return <Tag>Không xác định</Tag>;
    }

    const today = dayjs().startOf("day");

    const daysLeft = expiry.diff(today, "day");

    /* =========================
       EXPIRED
    ========================= */

    if (daysLeft < 0) {
      return <Tag color="red">Hết hạn</Tag>;
    }

    /* =========================
       <= 30 DAYS
    ========================= */

    if (daysLeft <= 30) {
      return <Tag color="volcano">Còn {daysLeft} ngày</Tag>;
    }

    /* =========================
       <= 90 DAYS
    ========================= */

    if (daysLeft <= 90) {
      return <Tag color="orange">Gần hết hạn</Tag>;
    }

    /* =========================
       VALID
    ========================= */

    return <Tag color="green">Còn hạn</Tag>;
  };

  /* =========================================================
     TABLE COLUMNS
  ========================================================= */

  const columns = [
    /* =========================
       STT
    ========================= */

    {
      title: "STT",

      key: "stt",

      width: 70,

      fixed: "left" as const,

      render: (_: unknown, __: InventoryItem, index: number) => index + 1,
    },

    /* =========================
       BATCH ID
    ========================= */

    {
      title: "ID lô",

      key: "batch_id",

      width: 90,

      render: (_: unknown, record: InventoryItem) => {
        const batchId = getBatchId(record);

        if (batchId === undefined) {
          return "-";
        }

        return <Tag>#{batchId}</Tag>;
      },
    },

    /* =========================
       WAREHOUSE
    ========================= */

    {
      title: "Kho",

      key: "warehouse",

      width: 180,

      render: (_: unknown, record: InventoryItem) => {
        const type = getWarehouseType(record);

        return (
          <div>
            <Text strong>{getWarehouseName(record)}</Text>

            <br />

            <Text type="secondary">{getWarehouseCode(record)}</Text>

            <br />

            <Tag
              color={
                type === "MAIN" ? "blue" : type === "SALE" ? "cyan" : undefined
              }
            >
              {type === "MAIN"
                ? "Kho chính"
                : type === "SALE"
                  ? "Kho bán"
                  : type || "-"}
            </Tag>
          </div>
        );
      },
    },

    /* =========================
       MEDICINE CODE
    ========================= */

    {
      title: "Mã thuốc",

      key: "medicine_code",

      width: 130,

      render: (_: unknown, record: InventoryItem) => (
        <Text strong>{getMedicineCode(record)}</Text>
      ),
    },

    /* =========================
       MEDICINE NAME
    ========================= */

    {
      title: "Tên thuốc",

      key: "medicine_name",

      width: 240,

      render: (_: unknown, record: InventoryItem) => {
        const strength = getMedicineStrength(record);

        return (
          <div>
            <Text strong>{getMedicineName(record)}</Text>

            {strength && (
              <>
                <br />

                <Text type="secondary">{strength}</Text>
              </>
            )}
          </div>
        );
      },
    },

    /* =========================
       LOT NUMBER
    ========================= */

    {
      title: "Số lô",

      key: "lot_number",

      width: 160,

      render: (_: unknown, record: InventoryItem) => (
        <Text>{getLotNumber(record)}</Text>
      ),
    },

    /* =========================
       EXPIRY DATE
    ========================= */

    {
      title: "Hạn sử dụng",

      key: "expiry_date",

      width: 145,

      render: (_: unknown, record: InventoryItem) => {
        const expiry = getExpiryDate(record);

        if (!expiry) {
          return "-";
        }

        const date = dayjs(expiry);

        if (!date.isValid()) {
          return expiry;
        }

        return date.format("DD/MM/YYYY");
      },
    },

    /* =========================
       EXPIRY STATUS
    ========================= */

    {
      title: "Tình trạng HSD",

      key: "expiry_status",

      width: 155,

      render: (_: unknown, record: InventoryItem) =>
        renderExpiryStatus(getExpiryDate(record)),
    },

    /* =========================
       QUANTITY
    ========================= */

    {
      title: "Tồn vật lý",

      key: "physical_quantity",

      width: 145,

      render: (
        _: unknown,
        record: InventoryItem,
      ) => {
        const quantity =
          getPhysicalQuantity(record);

        return (
          <Space>
            <Text
              strong
              style={{
                fontSize: 16,
              }}
            >
              {quantity.toLocaleString(
                "vi-VN",
              )}
            </Text>

            <Text type="secondary">
              {getUnit(record)}
            </Text>
          </Space>
        );
      },
    },

    {
      title: "Đang giữ",

      key: "reserved_quantity",

      width: 145,

      render: (
        _: unknown,
        record: InventoryItem,
      ) => {
        const reserved =
          getReservedQuantity(record);

        if (reserved <= 0) {
          return (
            <Text type="secondary">
              0 {getUnit(record)}
            </Text>
          );
        }

        const rowReservations =
          getActiveReservationsForRow(
            record,
          );

        const content =
          rowReservations.length > 0 ? (
            <Space
              direction="vertical"
              size={8}
              style={{
                maxWidth: 360,
              }}
            >
              <Text strong>
                Chi tiết số lượng đang giữ
              </Text>

              {rowReservations.map(
                (reservation, index) => (
                  <div
                    key={
                      reservation.id ??
                      `${reservation.reference_type}-${reservation.reference_id}-${index}`
                    }
                    style={{
                      paddingBottom:
                        index <
                        rowReservations.length -
                          1
                          ? 8
                          : 0,
                      borderBottom:
                        index <
                        rowReservations.length -
                          1
                          ? "1px solid #f0f0f0"
                          : undefined,
                    }}
                  >
                    <Text strong>
                      {getReservationTypeLabel(
                        reservation.reference_type,
                      )}
                    </Text>

                    <br />

                    <Text type="secondary">
                      Chứng từ ID: #
                      {reservation.reference_id ??
                        "-"}
                    </Text>

                    <br />

                    <Text>
                      Giữ{" "}
                      {Number(
                        reservation.quantity ||
                          0,
                      ).toLocaleString(
                        "vi-VN",
                      )}{" "}
                      {reservation.unit ||
                        getUnit(record)}
                    </Text>

                    {reservation.note && (
                      <>
                        <br />
                        <Text
                          type="secondary"
                          style={{
                            fontSize: 12,
                          }}
                        >
                          {reservation.note}
                        </Text>
                      </>
                    )}
                  </div>
                ),
              )}
            </Space>
          ) : (
            <Text type="secondary">
              Có {reserved.toLocaleString(
                "vi-VN",
              )}{" "}
              {getUnit(record)} đang giữ,
              nhưng chưa tải được chi tiết
              nguồn giữ.
            </Text>
          );

        return (
          <Popover
            trigger="click"
            placement="left"
            content={content}
          >
            <Button
              type="link"
              size="small"
              style={{
                paddingInline: 4,
              }}
            >
              <Tag
                color="orange"
                style={{
                  marginInlineEnd: 0,
                  cursor: "pointer",
                }}
              >
                {reserved.toLocaleString(
                  "vi-VN",
                )}{" "}
                {getUnit(record)}
              </Tag>
            </Button>
          </Popover>
        );
      },
    },

    {
      title: "Khả dụng",

      key: "available_quantity",

      width: 145,

      render: (
        _: unknown,
        record: InventoryItem,
      ) => {
        const available =
          getAvailableQuantity(record);

        return (
          <Text
            strong
            type={
              available <= 0
                ? "danger"
                : "success"
            }
            style={{
              fontSize: 16,
            }}
          >
            {available.toLocaleString(
              "vi-VN",
            )}{" "}
            {getUnit(record)}
          </Text>
        );
      },
    },
  ];

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div>
      {/* =====================================================
          HEADER
      ===================================================== */}

      <div
        style={{
          display: "flex",

          justifyContent: "space-between",

          alignItems: "flex-start",

          gap: 16,

          marginBottom: 24,
        }}
      >
        <div>
          <Title
            level={3}
            style={{
              marginBottom: 4,
            }}
          >
            Tồn kho
          </Title>

          <Text type="secondary">
            Theo dõi tồn kho theo từng thuốc, từng lô và từng kho
          </Text>
        </div>

        <Button
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => void loadInventory()}
        >
          Làm mới
        </Button>
      </div>

      {/* =====================================================
          SUMMARY
      ===================================================== */}

      <Space
        wrap
        size={16}
        style={{
          width: "100%",

          marginBottom: 16,
        }}
      >
        {/* =========================
            MEDICINE COUNT
        ========================= */}

        <Card
          style={{
            minWidth: 190,
          }}
        >
          <Statistic
            title="Số loại thuốc"
            value={medicineCount}
            suffix="loại"
          />
        </Card>

        {/* =========================
            BATCH COUNT
        ========================= */}

        <Card
          style={{
            minWidth: 190,
          }}
        >
          <Statistic title="Số lô" value={batchCount} suffix="lô" />
        </Card>

        {/* =========================
            TOTAL
        ========================= */}

        <Card
          style={{
            minWidth: 190,
          }}
        >
          <Statistic
            title="Tổng tồn vật lý"
            value={totalQuantity}
            suffix="đơn vị"
          />
        </Card>

        <Card
          style={{
            minWidth: 190,
          }}
        >
          <Statistic
            title="Đang giữ"
            value={totalReservedQuantity}
            suffix="đơn vị"
          />
        </Card>

        <Card
          style={{
            minWidth: 190,
          }}
        >
          <Statistic
            title="Khả dụng"
            value={totalAvailableQuantity}
            suffix="đơn vị"
          />
        </Card>

        {/* =========================
            MAIN WAREHOUSE
        ========================= */}

        <Card
          style={{
            minWidth: 220,
          }}
        >
          <Statistic
            title={`Kho chính (${mainWarehouseMedicineCount} loại)`}
            value={mainWarehouseTotal}
            suffix="đơn vị"
          />
        </Card>

        {/* =========================
            SALE WAREHOUSE
        ========================= */}

        <Card
          style={{
            minWidth: 220,
          }}
        >
          <Statistic
            title={`Kho bán (${saleWarehouseMedicineCount} loại)`}
            value={saleWarehouseTotal}
            suffix="đơn vị"
          />
        </Card>
      </Space>

      {/* =====================================================
          NOTICE
      ===================================================== */}

      <Alert
        type="info"
        showIcon
        style={{
          marginBottom: 16,
        }}
        message="Tồn kho được quản lý theo từng lô thuốc"
        description={
          <>
            Một thuốc có thể xuất hiện nhiều dòng nếu có nhiều lô khác nhau. Mỗi
            dòng tồn kho được xác định bằng{" "}
            <Text strong>warehouse_id + batch_id</Text>. Các lô có số lượng bằng
            0 không hiển thị tại danh sách tồn kho.
          </>
        }
      />

      {/* =====================================================
          FILTER
      ===================================================== */}

      {batchIdParam && (
        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 16 }}
          message={`Đang xem tồn kho của ID lô #${batchIdParam}`}
          description="Hiển thị đúng lô này ở tất cả kho để bạn đối chiếu sau chuyển kho."
          action={
            <Button
              size="small"
              onClick={() => {
                setSearch("");
                setWarehouseFilter(undefined);
                setSearchParams({});
              }}
            >
              Xem tất cả tồn kho
            </Button>
          }
        />
      )}

      <Card
        title="Bộ lọc tồn kho"
        style={{
          marginBottom: 16,
        }}
      >
        <Space
          wrap
          size={16}
          align="end"
        >
          <div>
            <Text
              strong
              style={{
                display: "block",
                marginBottom: 6,
              }}
            >
              Tìm kiếm
            </Text>

            <Input
              prefix={<SearchOutlined />}
              allowClear
              placeholder="VD: #21, T000010, BIRAGAN, BIR-DEMO-007..."
              value={search}
              style={{
                width: 430,
              }}
              onChange={(event) => {
                setSearch(event.target.value);

                /*
                 * Khi người dùng tự gõ lại điều kiện,
                 * bỏ khóa batch_id từ URL để bộ lọc
                 * hoạt động theo nội dung đang nhập.
                 */
                if (batchIdParam !== undefined) {
                  setSearchParams({});
                }
              }}
            />

            <Text
              type="secondary"
              style={{
                display: "block",
                marginTop: 4,
                fontSize: 12,
              }}
            >
              Gõ #ID để tìm chính xác ID lô, ví dụ #21.
            </Text>
          </div>

          <div>
            <Text
              strong
              style={{
                display: "block",
                marginBottom: 6,
              }}
            >
              Kho
            </Text>

            <Select
              allowClear
              placeholder="Tất cả kho"
              value={warehouseFilter}
              style={{
                width: 200,
              }}
              options={[
                {
                  value: "MAIN",
                  label: "Kho chính",
                },
                {
                  value: "SALE",
                  label: "Kho bán",
                },
              ]}
              onChange={(value) =>
                setWarehouseFilter(value)
              }
            />
          </div>

          <Button
            onClick={() => {
              setSearch("");
              setWarehouseFilter(undefined);
              setSearchParams({});
            }}
          >
            Xóa bộ lọc
          </Button>
        </Space>
      </Card>

      {/* =====================================================
          TABLE
      ===================================================== */}

      <Card title={`Danh sách tồn kho — ${filteredInventory.length} dòng • ${filteredBatchCount} lô`}>
        <Table
          /*
           * QUAN TRỌNG
           *
           * Một batch có thể tồn tại
           * ở nhiều kho.
           *
           * Vì vậy rowKey KHÔNG
           * được chỉ dùng batch_id.
           *
           * Phải dùng:
           *
           * warehouse_id + batch_id
           */

          rowKey={(record) => {
            const warehouseId = getWarehouseId(record);

            const batchId = getBatchId(record);

            return `${warehouseId ?? "warehouse"}-${batchId ?? record.id ?? "batch"}`;
          }}
          columns={columns}
          dataSource={filteredInventory}
          loading={loading}
          scroll={{
            x: 1800,
          }}
          pagination={{
            pageSize: 10,

            showSizeChanger: true,

            pageSizeOptions: [10, 20, 50, 100],

            showTotal: (total) => `Tổng ${total} dòng tồn kho`,
          }}
          locale={{
            emptyText: "Không có dữ liệu tồn kho",
          }}
        />
      </Card>
    </div>
  );
}

export default Inventory;
