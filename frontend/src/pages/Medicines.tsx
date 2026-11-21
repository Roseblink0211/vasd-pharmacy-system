import { useEffect, useMemo, useState } from "react";

import {
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";

import {
  Button,
  Card,
  Col,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";

import type { TableColumnsType } from "antd";

import api from "../api/api";

const { Text, Title } = Typography;

/* =========================================================
   TYPES
========================================================= */

interface Supplier {
  id: number;
  supplier_code?: string;
  name: string;
  is_active?: boolean;
}

interface Medicine {
  id: number;

  medicine_code: string;
  name: string;
  active_ingredient: string;

  strength?: string | null;
  dosage_form?: string | null;
  unit?: string | null;

  route_of_administration?: string | null;
  usage_instructions?: string | null;
  packaging?: string | null;

  manufacturer?: string | null;
  country_of_origin?: string | null;
  registration_number?: string | null;

  supplier?: Supplier | null;

  note?: string | null;

  is_active: boolean;

  created_at?: string | null;
  updated_at?: string | null;

  /* STEP 23 */
  has_been_imported?: boolean;
  import_status?: "Đã nhập" | "Chưa nhập" | string;
  current_stock?: number | string;
}

interface MedicineFormValues {
  name: string;
  active_ingredient: string;

  strength?: string;
  dosage_form?: string;
  unit?: string;

  route_of_administration?: string;
  usage_instructions?: string;
  packaging?: string;

  manufacturer?: string;
  country_of_origin?: string;
  registration_number?: string;

  supplier_id: number;

  note?: string;
}

type ImportFilter = "ALL" | "IMPORTED" | "NOT_IMPORTED";

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

function cleanText(
  value?: string | null,
) {
  const normalized =
    value?.trim() || "";

  return normalized || null;
}

function formatNumber(
  value?: number | string | null,
) {
  return new Intl.NumberFormat(
    "vi-VN",
  ).format(Number(value || 0));
}

function getImportStatus(
  medicine: Medicine,
) {
  if (
    medicine.has_been_imported === true
  ) {
    return "Đã nhập";
  }

  if (
    medicine.has_been_imported === false
  ) {
    return "Chưa nhập";
  }

  return medicine.import_status ||
    "Chưa xác định";
}

/* =========================================================
   COMPONENT
========================================================= */

function Medicines() {
  const [form] =
    Form.useForm<MedicineFormValues>();

  const [medicines, setMedicines] =
    useState<Medicine[]>([]);

  const [suppliers, setSuppliers] =
    useState<Supplier[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [statusChangingId, setStatusChangingId] =
    useState<number | null>(null);

  /* =========================
     FILTERS
  ========================= */

  const [search, setSearch] =
    useState("");

  const [supplierFilter, setSupplierFilter] =
    useState<number | undefined>();

  const [activeFilter, setActiveFilter] =
    useState<boolean | undefined>();

  const [importFilter, setImportFilter] =
    useState<ImportFilter>("ALL");

  /* =========================
     MODAL
  ========================= */

  const [modalOpen, setModalOpen] =
    useState(false);

  const [editingMedicine, setEditingMedicine] =
    useState<Medicine | null>(null);

  /* =========================================================
     LOAD MASTER DATA
  ========================================================= */

  const loadSuppliers = async () => {
    try {
      const response = await api.get(
        "/suppliers",
        {
          params: {
            is_active: true,
          },
        },
      );

      if (
        response.data?.success !== true
      ) {
        return;
      }

      setSuppliers(
        normalizeArray<Supplier>(
          response.data,
          [
            "data",
            "suppliers",
          ],
        ),
      );
    } catch (error) {
      console.error(
        "Load suppliers:",
        error,
      );
    }
  };

  /* =========================================================
     LOAD MEDICINES
  ========================================================= */

  const buildParams = () => {
    const params: {
      search?: string;
      supplier_id?: number;
      is_active?: boolean;
    } = {};

    const keyword = search.trim();

    const isIdSearch =
      /^#?\d+$/.test(keyword);

    if (keyword && !isIdSearch) {
      params.search = keyword;
    }

    if (
      supplierFilter !== undefined
    ) {
      params.supplier_id =
        supplierFilter;
    }

    if (
      activeFilter !== undefined
    ) {
      params.is_active =
        activeFilter;
    }

    return params;
  };

  const loadMedicines = async (
    showSuccess = false,
  ) => {
    try {
      setLoading(true);

      const response = await api.get(
        "/medicines",
        {
          params: buildParams(),
        },
      );

      if (
        response.data?.success !== true
      ) {
        message.error(
          response.data?.message ||
            "Không thể tải danh mục thuốc",
        );
        return;
      }

      setMedicines(
        normalizeArray<Medicine>(
          response.data,
          [
            "data",
            "medicines",
          ],
        ),
      );

      if (showSuccess) {
        message.success(
          "Đã cập nhật danh mục thuốc",
        );
      }
    } catch (error) {
      console.error(
        "Load medicines:",
        error,
      );

      message.error(
        "Không thể tải danh mục thuốc",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSuppliers();
    void loadMedicines();
  }, []);

  /* =========================================================
     CLIENT-SIDE IMPORT FILTER
     API đã trả has_been_imported.
     Không cần thay đổi FastAPI.
  ========================================================= */

  const filteredMedicines =
    useMemo(() => {
      const keyword =
        search.trim().toLowerCase();

      const idKeyword =
        keyword.replace(/^#/, "");

      const bySearch =
        medicines.filter(
          (medicine) => {
            if (!keyword) {
              return true;
            }

            return (
              String(medicine.id) ===
                idKeyword ||
              medicine.medicine_code
                .toLowerCase()
                .includes(keyword) ||
              medicine.name
                .toLowerCase()
                .includes(keyword) ||
              medicine.active_ingredient
                .toLowerCase()
                .includes(keyword) ||
              (
                medicine.registration_number ||
                ""
              )
                .toLowerCase()
                .includes(keyword)
            );
          },
        );

      if (importFilter === "ALL") {
        return bySearch;
      }

      if (
        importFilter === "IMPORTED"
      ) {
        return bySearch.filter(
          (medicine) =>
            medicine.has_been_imported ===
              true ||
            medicine.import_status ===
              "Đã nhập",
        );
      }

      return bySearch.filter(
        (medicine) =>
          medicine.has_been_imported ===
            false ||
          medicine.import_status ===
            "Chưa nhập",
      );
    }, [
      medicines,
      importFilter,
      search,
    ]);

  /* =========================================================
     SUMMARY
  ========================================================= */

  const summary = useMemo(() => {
    const total = medicines.length;

    const imported =
      medicines.filter(
        (medicine) =>
          medicine.has_been_imported ===
            true ||
          medicine.import_status ===
            "Đã nhập",
      ).length;

    const notImported =
      medicines.filter(
        (medicine) =>
          medicine.has_been_imported ===
            false ||
          medicine.import_status ===
            "Chưa nhập",
      ).length;

    const totalStock =
      medicines.reduce(
        (sum, medicine) =>
          sum +
          Number(
            medicine.current_stock ||
              0,
          ),
        0,
      );

    return {
      total,
      imported,
      notImported,
      totalStock,
    };
  }, [medicines]);

  /* =========================================================
     FILTER ACTIONS
  ========================================================= */

  const handleSearch = () => {
    void loadMedicines();
  };

  const handleReset = () => {
    setSearch("");
    setSupplierFilter(undefined);
    setActiveFilter(undefined);
    setImportFilter("ALL");

    void (async () => {
      try {
        setLoading(true);

        const response =
          await api.get(
            "/medicines",
          );

        if (
          response.data?.success ===
          true
        ) {
          setMedicines(
            normalizeArray<Medicine>(
              response.data,
              [
                "data",
                "medicines",
              ],
            ),
          );
        }
      } catch (error) {
        console.error(
          "Reset medicines:",
          error,
        );
      } finally {
        setLoading(false);
      }
    })();
  };

  /* =========================================================
     CREATE / EDIT
  ========================================================= */

  const openCreateModal = () => {
    setEditingMedicine(null);

    form.resetFields();

    setModalOpen(true);
  };

  const openEditModal = (
    medicine: Medicine,
  ) => {
    setEditingMedicine(
      medicine,
    );

    form.setFieldsValue({
      name: medicine.name,
      active_ingredient:
        medicine.active_ingredient,

      strength:
        medicine.strength || "",
      dosage_form:
        medicine.dosage_form || "",
      unit:
        medicine.unit || "",

      route_of_administration:
        medicine.route_of_administration ||
        "",

      usage_instructions:
        medicine.usage_instructions ||
        "",

      packaging:
        medicine.packaging || "",

      manufacturer:
        medicine.manufacturer || "",

      country_of_origin:
        medicine.country_of_origin ||
        "",

      registration_number:
        medicine.registration_number ||
        "",

      supplier_id:
        medicine.supplier?.id || 0,

      note:
        medicine.note || "",
    });

    setModalOpen(true);
  };

  const buildPayload = (
    values: MedicineFormValues,
  ) => ({
    name: values.name.trim(),

    active_ingredient:
      values.active_ingredient.trim(),

    strength:
      cleanText(
        values.strength,
      ),

    dosage_form:
      cleanText(
        values.dosage_form,
      ),

    unit:
      cleanText(
        values.unit,
      ),

    route_of_administration:
      cleanText(
        values.route_of_administration,
      ),

    usage_instructions:
      cleanText(
        values.usage_instructions,
      ),

    packaging:
      cleanText(
        values.packaging,
      ),

    manufacturer:
      cleanText(
        values.manufacturer,
      ),

    country_of_origin:
      cleanText(
        values.country_of_origin,
      ),

    registration_number:
      cleanText(
        values.registration_number,
      ),

    supplier_id:
      values.supplier_id,

    note:
      cleanText(
        values.note,
      ),
  });

  const handleSave = async (
    values: MedicineFormValues,
  ) => {
    try {
      setSaving(true);

      const payload =
        buildPayload(values);

      const response =
        editingMedicine
          ? await api.put(
              `/medicines/${editingMedicine.id}`,
              payload,
            )
          : await api.post(
              "/medicines",
              payload,
            );

      if (
        response.data?.success !== true
      ) {
        message.error(
          response.data?.message ||
            "Không thể lưu thuốc",
        );
        return;
      }

      message.success(
        response.data?.message ||
          (editingMedicine
            ? "Cập nhật thuốc thành công"
            : "Thêm thuốc thành công"),
      );

      setModalOpen(false);
      setEditingMedicine(null);

      form.resetFields();

      await loadMedicines();
    } catch (error) {
      console.error(
        "Save medicine:",
        error,
      );

      message.error(
        "Có lỗi khi lưu thuốc",
      );
    } finally {
      setSaving(false);
    }
  };

  /* =========================================================
     ENABLE / DISABLE
  ========================================================= */

  const changeMedicineStatus =
    async (
      medicine: Medicine,
      nextStatus: boolean,
    ) => {
      try {
        setStatusChangingId(
          medicine.id,
        );

        const response =
          await api.patch(
            `/medicines/${medicine.id}/status`,
            {
              is_active:
                nextStatus,
            },
          );

        if (
          response.data?.success !==
          true
        ) {
          message.error(
            response.data?.message ||
              "Không thể cập nhật trạng thái thuốc",
          );
          return;
        }

        message.success(
          response.data?.message ||
            (nextStatus
              ? "Đã kích hoạt thuốc"
              : "Đã ngừng sử dụng thuốc"),
        );

        await loadMedicines();
      } catch (error) {
        console.error(
          "Change medicine status:",
          error,
        );

        message.error(
          "Có lỗi khi cập nhật trạng thái thuốc",
        );
      } finally {
        setStatusChangingId(
          null,
        );
      }
    };

  /* =========================================================
     TABLE
  ========================================================= */

  const columns: TableColumnsType<Medicine> = [
    {
      title: "STT",
      key: "stt",
      width: 65,
      align: "center",
      fixed: "left",

      render: (
        _value,
        _record,
        index,
      ) => index + 1,
    },

    {
      title: "ID thuốc",
      dataIndex: "id",
      key: "id",
      width: 90,
      align: "center",
      fixed: "left",
      render: (value) => (
        <Text code>
          #{value}
        </Text>
      ),
    },

    {
      title: "Mã thuốc",
      dataIndex: "medicine_code",
      key: "medicine_code",
      width: 120,
      fixed: "left",

      render: (value) => (
        <Text strong>
          {value || "-"}
        </Text>
      ),
    },

    {
      title: "Tên thuốc",
      dataIndex: "name",
      key: "name",
      width: 230,
    },

    {
      title: "Hoạt chất",
      dataIndex:
        "active_ingredient",
      key: "active_ingredient",
      width: 220,

      ellipsis: true,
    },

    {
      title: "Hàm lượng",
      dataIndex: "strength",
      key: "strength",
      width: 135,

      render: (value) =>
        value || "-",
    },

    {
      title: "Dạng bào chế",
      dataIndex: "dosage_form",
      key: "dosage_form",
      width: 170,

      ellipsis: true,

      render: (value) =>
        value || "-",
    },

    {
      title: "Đơn vị",
      dataIndex: "unit",
      key: "unit",
      width: 100,

      render: (value) =>
        value || "-",
    },

    {
      title: "Nhà cung cấp",
      key: "supplier",
      width: 240,

      ellipsis: true,

      render: (
        _value,
        record,
      ) =>
        record.supplier?.name ||
        "-",
    },

    /* ===============================================
       STEP 23 - IMPORT STATUS
    =============================================== */

    {
      title: "Tình trạng nhập",
      key: "import_status",
      width: 145,
      align: "center",

      render: (
        _value,
        record,
      ) => {
        const status =
          getImportStatus(record);

        if (
          status === "Đã nhập"
        ) {
          return (
            <Tag
              color="green"
              icon={
                <CheckCircleOutlined />
              }
            >
              Đã nhập
            </Tag>
          );
        }

        if (
          status ===
          "Chưa nhập"
        ) {
          return (
            <Tag>
              Chưa nhập
            </Tag>
          );
        }

        return (
          <Tag color="orange">
            {status}
          </Tag>
        );
      },
    },

    {
      title: "Tồn hiện tại",
      dataIndex:
        "current_stock",
      key: "current_stock",
      width: 130,
      align: "right",

      sorter: (a, b) =>
        Number(
          a.current_stock || 0,
        ) -
        Number(
          b.current_stock || 0,
        ),

      render: (
        value,
        record,
      ) => {
        const quantity =
          Number(value || 0);

        return (
          <Space size={4}>
            <Text
              strong={
                quantity > 0
              }
              type={
                quantity <= 0
                  ? "secondary"
                  : undefined
              }
            >
              {formatNumber(
                quantity,
              )}
            </Text>

            {record.unit && (
              <Text
                type="secondary"
              >
                {record.unit}
              </Text>
            )}
          </Space>
        );
      },
    },

    {
      title: "Trạng thái",
      dataIndex: "is_active",
      key: "is_active",
      width: 115,
      align: "center",

      render: (value) =>
        value ? (
          <Tag color="blue">
            Hoạt động
          </Tag>
        ) : (
          <Tag color="red">
            Ngừng
          </Tag>
        ),
    },

    {
      title: "Thao tác",
      key: "actions",
      width: 190,
      fixed: "right",

      render: (
        _value,
        record,
      ) => (
        <Space wrap>
          <Button
            type="link"
            size="small"
            icon={
              <EditOutlined />
            }
            onClick={() =>
              openEditModal(
                record,
              )
            }
          >
            Sửa
          </Button>

          {record.is_active ? (
            <Popconfirm
              title="Ngừng sử dụng thuốc?"
              description="Thuốc sẽ không còn được chọn trong các nghiệp vụ mới."
              okText="Ngừng"
              cancelText="Hủy"
              onConfirm={() =>
                void changeMedicineStatus(
                  record,
                  false,
                )
              }
            >
              <Button
                type="link"
                danger
                size="small"
                loading={
                  statusChangingId ===
                  record.id
                }
                icon={
                  <StopOutlined />
                }
              >
                Ngừng
              </Button>
            </Popconfirm>
          ) : (
            <Popconfirm
              title="Kích hoạt lại thuốc?"
              okText="Kích hoạt"
              cancelText="Hủy"
              onConfirm={() =>
                void changeMedicineStatus(
                  record,
                  true,
                )
              }
            >
              <Button
                type="link"
                size="small"
                loading={
                  statusChangingId ===
                  record.id
                }
                icon={
                  <CheckCircleOutlined />
                }
              >
                Kích hoạt
              </Button>
            </Popconfirm>
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
      {/* HEADER */}

      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
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
            Danh mục thuốc
          </Title>

          <Text type="secondary">
            Quản lý danh mục thuốc và theo dõi thuốc đã từng nhập kho.
          </Text>
        </div>

        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={
            openCreateModal
          }
        >
          Thêm thuốc
        </Button>
      </div>

      {/* SUMMARY */}

      <Row
        gutter={[16, 16]}
        style={{
          marginBottom: 16,
        }}
      >
        <Col
          xs={24}
          sm={12}
          lg={6}
        >
          <Card size="small">
            <Text type="secondary">
              Thuốc trong danh mục
            </Text>

            <Title
              level={3}
              style={{
                margin: "4px 0 0",
              }}
            >
              {summary.total}
            </Title>
          </Card>
        </Col>

        <Col
          xs={24}
          sm={12}
          lg={6}
        >
          <Card size="small">
            <Text type="secondary">
              Đã từng nhập
            </Text>

            <Title
              level={3}
              style={{
                margin: "4px 0 0",
              }}
            >
              {summary.imported}
            </Title>
          </Card>
        </Col>

        <Col
          xs={24}
          sm={12}
          lg={6}
        >
          <Card size="small">
            <Text type="secondary">
              Chưa nhập
            </Text>

            <Title
              level={3}
              style={{
                margin: "4px 0 0",
              }}
            >
              {summary.notImported}
            </Title>
          </Card>
        </Col>

        <Col
          xs={24}
          sm={12}
          lg={6}
        >
          <Card size="small">
            <Text type="secondary">
              Tổng tồn hiện tại
            </Text>

            <Title
              level={3}
              style={{
                margin: "4px 0 0",
              }}
            >
              {formatNumber(
                summary.totalStock,
              )}
            </Title>
          </Card>
        </Col>
      </Row>

      {/* FILTER */}

      <Card
        style={{
          marginBottom: 16,
        }}
      >
        <Space
          wrap
          size={12}
          style={{
            width: "100%",
          }}
        >
          <Input
            allowClear
            style={{
              width: 400,
            }}
            prefix={
              <SearchOutlined />
            }
            placeholder="Tìm ID (#11), mã, tên, hoạt chất, số đăng ký..."
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
            onPressEnter={
              handleSearch
            }
          />

          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            style={{
              width: 285,
            }}
            placeholder="Nhà cung cấp"
            value={
              supplierFilter
            }
            options={suppliers.map(
              (supplier) => ({
                value:
                  supplier.id,
                label:
                  supplier.name,
              }),
            )}
            onChange={(value) =>
              setSupplierFilter(
                value,
              )
            }
          />

          <Select
            allowClear
            style={{
              width: 170,
            }}
            placeholder="Trạng thái"
            value={
              activeFilter
            }
            options={[
              {
                value: true,
                label:
                  "Hoạt động",
              },
              {
                value: false,
                label:
                  "Ngừng",
              },
            ]}
            onChange={(value) =>
              setActiveFilter(
                value,
              )
            }
          />

          <Select
            style={{
              width: 175,
            }}
            value={importFilter}
            options={[
              {
                value: "ALL",
                label:
                  "Tất cả tình trạng nhập",
              },
              {
                value:
                  "IMPORTED",
                label:
                  "Đã nhập",
              },
              {
                value:
                  "NOT_IMPORTED",
                label:
                  "Chưa nhập",
              },
            ]}
            onChange={(
              value: ImportFilter,
            ) =>
              setImportFilter(
                value,
              )
            }
          />

          <Button
            type="primary"
            icon={
              <SearchOutlined />
            }
            onClick={
              handleSearch
            }
          >
            Tìm kiếm
          </Button>

          <Button
            icon={
              <ReloadOutlined />
            }
            onClick={
              handleReset
            }
          >
            Làm mới
          </Button>
        </Space>
      </Card>

      {/* TABLE */}

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={
            filteredMedicines
          }
          loading={loading}
          scroll={{
            x: 1990,
          }}
          pagination={{
            pageSize: 10,
            showSizeChanger: false,

            showTotal: (
              total,
            ) =>
              `Tổng ${total} thuốc`,
          }}
        />
      </Card>

      {/* CREATE / EDIT MODAL */}

      <Modal
        title={
          editingMedicine
            ? `Sửa thuốc ${editingMedicine.medicine_code}`
            : "Thêm thuốc"
        }
        open={modalOpen}
        width={900}
        destroyOnHidden
        okText={
          editingMedicine
            ? "Lưu thay đổi"
            : "Thêm thuốc"
        }
        cancelText="Hủy"
        confirmLoading={saving}
        onOk={() =>
          void form.submit()
        }
        onCancel={() => {
          if (saving) {
            return;
          }

          setModalOpen(false);
          setEditingMedicine(
            null,
          );

          form.resetFields();
        }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) =>
            void handleSave(
              values,
            )
          }
        >
          <Row gutter={16}>
            <Col
              xs={24}
              md={12}
            >
              <Form.Item
                name="name"
                label="Tên thuốc"
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message:
                      "Vui lòng nhập tên thuốc",
                  },
                ]}
              >
                <Input placeholder="Ví dụ: Paracetamol 500mg" />
              </Form.Item>
            </Col>

            <Col
              xs={24}
              md={12}
            >
              <Form.Item
                name="active_ingredient"
                label="Hoạt chất"
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message:
                      "Vui lòng nhập hoạt chất",
                  },
                ]}
              >
                <Input placeholder="Ví dụ: Paracetamol" />
              </Form.Item>
            </Col>

            <Col
              xs={24}
              md={8}
            >
              <Form.Item
                name="strength"
                label="Hàm lượng"
              >
                <Input placeholder="500 mg" />
              </Form.Item>
            </Col>

            <Col
              xs={24}
              md={8}
            >
              <Form.Item
                name="dosage_form"
                label="Dạng bào chế"
              >
                <Input placeholder="Viên nén" />
              </Form.Item>
            </Col>

            <Col
              xs={24}
              md={8}
            >
              <Form.Item
                name="unit"
                label="Đơn vị"
              >
                <Input placeholder="Hộp" />
              </Form.Item>
            </Col>

            <Col
              xs={24}
              md={12}
            >
              <Form.Item
                name="supplier_id"
                label="Nhà cung cấp"
                rules={[
                  {
                    required: true,
                    message:
                      "Vui lòng chọn nhà cung cấp",
                  },
                ]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn nhà cung cấp"
                  options={suppliers.map(
                    (
                      supplier,
                    ) => ({
                      value:
                        supplier.id,
                      label:
                        supplier.name,
                    }),
                  )}
                />
              </Form.Item>
            </Col>

            <Col
              xs={24}
              md={12}
            >
              <Form.Item
                name="registration_number"
                label="Số đăng ký"
              >
                <Input placeholder="VD-..." />
              </Form.Item>
            </Col>

            <Col
              xs={24}
              md={12}
            >
              <Form.Item
                name="manufacturer"
                label="Nhà sản xuất"
              >
                <Input />
              </Form.Item>
            </Col>

            <Col
              xs={24}
              md={12}
            >
              <Form.Item
                name="country_of_origin"
                label="Nước sản xuất"
              >
                <Input />
              </Form.Item>
            </Col>

            <Col
              xs={24}
              md={12}
            >
              <Form.Item
                name="packaging"
                label="Quy cách đóng gói"
              >
                <Input placeholder="Hộp 10 vỉ x 10 viên" />
              </Form.Item>
            </Col>

            <Col
              xs={24}
              md={12}
            >
              <Form.Item
                name="route_of_administration"
                label="Đường dùng"
              >
                <Input placeholder="Uống" />
              </Form.Item>
            </Col>

            <Col xs={24}>
              <Form.Item
                name="usage_instructions"
                label="Hướng dẫn sử dụng"
              >
                <Input.TextArea
                  rows={3}
                />
              </Form.Item>
            </Col>

            <Col xs={24}>
              <Form.Item
                name="note"
                label="Ghi chú"
              >
                <Input.TextArea
                  rows={3}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

export default Medicines;
