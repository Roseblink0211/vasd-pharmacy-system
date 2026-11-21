import { useEffect, useMemo, useState } from "react";

import {
  CheckCircleOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from "@ant-design/icons";

import {
  Alert,
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
  Statistic,
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

interface WarehouseType {
  type_code: string;
  type_name: string;
  description?: string | null;
  can_receive_purchase?: boolean;
  can_sell?: boolean;
  display_order?: number;
  is_active?: boolean;
}

interface Warehouse {
  id: number;
  warehouse_code: string;
  name: string;

  warehouse_type: string;
  warehouse_type_name?: string | null;
  warehouse_type_description?: string | null;

  can_receive_purchase?: boolean;
  can_sell?: boolean;

  default_can_receive_purchase?: boolean;
  default_can_sell?: boolean;

  can_receive_purchase_override?: boolean | null;
  can_sell_override?: boolean | null;

  description?: string | null;
  display_order?: number;

  is_active: boolean;

  created_at?: string | null;
  updated_at?: string | null;
}

type PermissionMode =
  | "INHERIT"
  | "ALLOW"
  | "DENY";

interface WarehouseFormValues {
  warehouse_code: string;
  name: string;
  warehouse_type: string;

  can_receive_purchase_mode: PermissionMode;
  can_sell_mode: PermissionMode;

  description?: string;
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

function typeColor(
  type?: string | null,
) {
  switch (type) {
    case "MAIN":
      return "blue";

    case "SALE":
      return "green";

    case "AUX":
      return "orange";

    case "RETAIL":
      return "purple";

    default:
      return "default";
  }
}


function overrideToMode(
  value?: boolean | null,
): PermissionMode {
  if (value === true) {
    return "ALLOW";
  }

  if (value === false) {
    return "DENY";
  }

  return "INHERIT";
}

function modeToOverride(
  mode: PermissionMode,
): boolean | null {
  if (mode === "ALLOW") {
    return true;
  }

  if (mode === "DENY") {
    return false;
  }

  return null;
}


/* =========================================================
   COMPONENT
========================================================= */

function Warehouses() {
  const [form] =
    Form.useForm<WarehouseFormValues>();

  const [warehouses, setWarehouses] =
    useState<Warehouse[]>([]);

  const [warehouseTypes, setWarehouseTypes] =
    useState<WarehouseType[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [
    changingStatusId,
    setChangingStatusId,
  ] = useState<number | null>(null);

  const [modalOpen, setModalOpen] =
    useState(false);

  const [
    editingWarehouse,
    setEditingWarehouse,
  ] = useState<Warehouse | null>(
    null,
  );

  const [search, setSearch] =
    useState("");

  const [
    typeFilter,
    setTypeFilter,
  ] = useState<string | undefined>();

  const [
    activeFilter,
    setActiveFilter,
  ] = useState<
    boolean | undefined
  >();


  /* =========================================================
     LOAD
  ========================================================= */

  const loadWarehouseTypes =
    async () => {
      try {
        const response =
          await api.get(
            "/warehouse-types",
          );

        if (
          response.data?.success !==
          true
        ) {
          message.error(
            response.data?.message ||
              "Không thể tải loại kho",
          );

          return;
        }

        setWarehouseTypes(
          normalizeArray<WarehouseType>(
            response.data,
            [
              "data",
              "warehouse_types",
            ],
          ),
        );
      } catch (error) {
        console.error(
          "Load warehouse types:",
          error,
        );

        message.error(
          "Không thể tải danh mục loại kho",
        );
      }
    };

  const loadWarehouses =
    async (
      showSuccess = false,
    ) => {
      try {
        setLoading(true);

        const response =
          await api.get(
            "/warehouses",
          );

        if (
          response.data?.success !==
          true
        ) {
          message.error(
            response.data?.message ||
              "Không thể tải danh sách kho",
          );

          return;
        }

        setWarehouses(
          normalizeArray<Warehouse>(
            response.data,
            [
              "data",
              "warehouses",
            ],
          ),
        );

        if (showSuccess) {
          message.success(
            "Đã cập nhật danh mục kho",
          );
        }
      } catch (error) {
        console.error(
          "Load warehouses:",
          error,
        );

        message.error(
          "Không thể tải danh mục kho",
        );
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    void loadWarehouseTypes();
    void loadWarehouses();
  }, []);


  /* =========================================================
     FILTER
  ========================================================= */

  const filteredWarehouses =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLocaleLowerCase(
            "vi-VN",
          );

      return warehouses.filter(
        (warehouse) => {
          const matchesSearch =
            !keyword ||
            [
              warehouse.warehouse_code,
              warehouse.name,
              warehouse.description,
              warehouse.warehouse_type_name,
            ]
              .filter(Boolean)
              .some((value) =>
                String(value)
                  .toLocaleLowerCase(
                    "vi-VN",
                  )
                  .includes(
                    keyword,
                  ),
              );

          const matchesType =
            !typeFilter ||
            warehouse.warehouse_type ===
              typeFilter;

          const matchesStatus =
            activeFilter ===
            undefined
              ? true
              : warehouse.is_active ===
                activeFilter;

          return (
            matchesSearch &&
            matchesType &&
            matchesStatus
          );
        },
      );
    }, [
      warehouses,
      search,
      typeFilter,
      activeFilter,
    ]);


  /* =========================================================
     SUMMARY
  ========================================================= */

  const summary = useMemo(
    () => ({
      total:
        warehouses.length,

      main:
        warehouses.filter(
          (item) =>
            item.warehouse_type ===
            "MAIN" &&
            item.is_active,
        ).length,

      sale:
        warehouses.filter(
          (item) =>
            item.warehouse_type ===
              "SALE" ||
            item.warehouse_type ===
              "RETAIL",
        ).filter(
          (item) =>
            item.is_active,
        ).length,

      inactive:
        warehouses.filter(
          (item) =>
            !item.is_active,
        ).length,
    }),
    [warehouses],
  );


  /* =========================================================
     CREATE / EDIT
  ========================================================= */

  const openCreateModal = () => {
    setEditingWarehouse(null);

    form.resetFields();

    form.setFieldsValue({
      warehouse_type: "AUX",
      can_receive_purchase_mode:
        "INHERIT",
      can_sell_mode:
        "INHERIT",
    });

    setModalOpen(true);
  };

  const openEditModal = (
    warehouse: Warehouse,
  ) => {
    setEditingWarehouse(
      warehouse,
    );

    form.setFieldsValue({
      warehouse_code:
        warehouse.warehouse_code,

      name:
        warehouse.name,

      warehouse_type:
        warehouse.warehouse_type,

      can_receive_purchase_mode:
        overrideToMode(
          warehouse.can_receive_purchase_override,
        ),

      can_sell_mode:
        overrideToMode(
          warehouse.can_sell_override,
        ),

      description:
        warehouse.description ||
        "",
    });

    setModalOpen(true);
  };

  const handleSave = async (
    values: WarehouseFormValues,
  ) => {
    try {
      setSaving(true);

      const payload = {
        warehouse_code:
          values.warehouse_code
            .trim()
            .toUpperCase(),

        name:
          values.name.trim(),

        warehouse_type:
          values.warehouse_type,

        can_receive_purchase_override:
          modeToOverride(
            values.can_receive_purchase_mode,
          ),

        can_sell_override:
          modeToOverride(
            values.can_sell_mode,
          ),

        description:
          values.description
            ?.trim() ||
          null,
      };

      const response =
        editingWarehouse
          ? await api.put(
              `/warehouses/${editingWarehouse.id}`,
              payload,
            )
          : await api.post(
              "/warehouses",
              payload,
            );

      if (
        response.data?.success !==
        true
      ) {
        message.error(
          response.data?.message ||
            "Không thể lưu kho",
        );

        return;
      }

      message.success(
        response.data?.message ||
          (editingWarehouse
            ? "Đã cập nhật kho"
            : "Đã thêm kho"),
      );

      setModalOpen(false);

      setEditingWarehouse(null);

      form.resetFields();

      await loadWarehouses();
    } catch (error) {
      console.error(
        "Save warehouse:",
        error,
      );

      message.error(
        "Có lỗi khi lưu thông tin kho",
      );
    } finally {
      setSaving(false);
    }
  };


  /* =========================================================
     STATUS
  ========================================================= */

  const changeStatus = async (
    warehouse: Warehouse,
    nextStatus: boolean,
  ) => {
    try {
      setChangingStatusId(
        warehouse.id,
      );

      const response =
        await api.patch(
          `/warehouses/${warehouse.id}/status`,
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
            "Không thể cập nhật trạng thái kho",
        );

        return;
      }

      message.success(
        response.data?.message ||
          (nextStatus
            ? "Đã kích hoạt kho"
            : "Đã ngừng hoạt động kho"),
      );

      await loadWarehouses();
    } catch (error) {
      console.error(
        "Warehouse status:",
        error,
      );

      message.error(
        "Có lỗi khi cập nhật trạng thái kho",
      );
    } finally {
      setChangingStatusId(
        null,
      );
    }
  };


  /* =========================================================
     TABLE
  ========================================================= */

  const columns: TableColumnsType<Warehouse> = [
    {
      title: "STT",
      key: "stt",
      width: 65,
      align: "center",

      render: (
        _,
        __,
        index,
      ) => index + 1,
    },

    {
      title: "Mã kho",
      dataIndex:
        "warehouse_code",
      key: "warehouse_code",
      width: 150,

      render: (value) => (
        <Text strong>
          {value}
        </Text>
      ),
    },

    {
      title: "Tên kho",
      dataIndex: "name",
      key: "name",
      width: 200,
    },

    {
      title: "Loại kho",
      key: "warehouse_type",
      width: 150,

      render: (_, record) => (
        <Tag
          color={typeColor(
            record.warehouse_type,
          )}
        >
          {record.warehouse_type_name ||
            record.warehouse_type}
        </Tag>
      ),
    },

    {
      title: "Nhập từ NCC",
      key: "can_receive_purchase",
      width: 125,
      align: "center",

      render: (_, record) =>
        record.can_receive_purchase ? (
          <Tag color="green">
            Cho phép
          </Tag>
        ) : (
          <Tag>
            Không
          </Tag>
        ),
    },

    {
      title: "Bán thuốc",
      key: "can_sell",
      width: 115,
      align: "center",

      render: (_, record) =>
        record.can_sell ? (
          <Tag color="green">
            Cho phép
          </Tag>
        ) : (
          <Tag>
            Không
          </Tag>
        ),
    },

    {
      title: "Mô tả",
      dataIndex:
        "description",
      key: "description",
      ellipsis: true,

      render: (value) =>
        value || "-",
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
      width: 205,
      fixed: "right",

      render: (_, record) => (
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
              title="Ngừng hoạt động kho?"
              description="Kho còn tồn thuốc sẽ không thể ngừng."
              okText="Ngừng"
              cancelText="Hủy"
              onConfirm={() =>
                void changeStatus(
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
                  changingStatusId ===
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
              title="Kích hoạt lại kho?"
              okText="Kích hoạt"
              cancelText="Hủy"
              onConfirm={() =>
                void changeStatus(
                  record,
                  true,
                )
              }
            >
              <Button
                type="link"
                size="small"
                loading={
                  changingStatusId ===
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
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <Title
            level={2}
            style={{
              marginBottom: 4,
            }}
          >
            Danh mục kho
          </Title>

          <Text type="secondary">
            Quản lý mã kho, tên kho và loại kho trong hệ thống.
          </Text>
        </div>

        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={
            openCreateModal
          }
        >
          Thêm kho
        </Button>
      </div>

      <Alert
        showIcon
        type="info"
        style={{
          marginBottom: 16,
        }}
        message="Quyền nghiệp vụ của kho"
        description="Loại kho cung cấp quyền mặc định. Khi cần, từng kho có thể ghi đè riêng quyền Nhập từ NCC và Bán thuốc. Chọn “Theo loại kho” để tiếp tục kế thừa cấu hình mặc định."
      />

      <Row
        gutter={[16, 16]}
        style={{
          marginBottom: 16,
        }}
      >
        <Col
          xs={24}
          sm={12}
          xl={6}
        >
          <Card size="small">
            <Statistic
              title="Tổng số kho"
              value={
                summary.total
              }
            />
          </Card>
        </Col>

        <Col
          xs={24}
          sm={12}
          xl={6}
        >
          <Card size="small">
            <Statistic
              title="Kho chính đang hoạt động"
              value={
                summary.main
              }
            />
          </Card>
        </Col>

        <Col
          xs={24}
          sm={12}
          xl={6}
        >
          <Card size="small">
            <Statistic
              title="Kho bán / kho lẻ"
              value={
                summary.sale
              }
            />
          </Card>
        </Col>

        <Col
          xs={24}
          sm={12}
          xl={6}
        >
          <Card size="small">
            <Statistic
              title="Kho đã ngừng"
              value={
                summary.inactive
              }
            />
          </Card>
        </Col>
      </Row>

      <Card
        style={{
          marginBottom: 16,
        }}
      >
        <Space
          wrap
          size={12}
        >
          <Input
            allowClear
            style={{
              width: 330,
            }}
            prefix={
              <SearchOutlined />
            }
            placeholder="Tìm mã kho, tên kho, mô tả..."
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
          />

          <Select
            allowClear
            style={{
              width: 180,
            }}
            placeholder="Loại kho"
            value={typeFilter}
            options={warehouseTypes.map(
              (item) => ({
                value:
                  item.type_code,
                label:
                  item.type_name,
              }),
            )}
            onChange={(value) =>
              setTypeFilter(
                value,
              )
            }
          />

          <Select
            allowClear
            style={{
              width: 160,
            }}
            placeholder="Trạng thái"
            value={activeFilter}
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

          <Button
            icon={
              <ReloadOutlined />
            }
            loading={loading}
            onClick={() => {
              setSearch("");
              setTypeFilter(
                undefined,
              );
              setActiveFilter(
                undefined,
              );

              void loadWarehouses(
                true,
              );
            }}
          >
            Làm mới
          </Button>
        </Space>
      </Card>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={
            filteredWarehouses
          }
          loading={loading}
          scroll={{
            x: 1350,
          }}
          pagination={{
            pageSize: 10,
            showSizeChanger: false,

            showTotal: (
              total,
            ) =>
              `Tổng ${total} kho`,
          }}
        />
      </Card>

      <Modal
        title={
          editingWarehouse
            ? `Sửa kho ${editingWarehouse.warehouse_code}`
            : "Thêm kho"
        }
        open={modalOpen}
        width={700}
        destroyOnHidden
        okText={
          editingWarehouse
            ? "Lưu thay đổi"
            : "Thêm kho"
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

          setEditingWarehouse(
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
                label="Mã kho"
                name="warehouse_code"
                extra="Ví dụ: KHO_PHU_01"
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message:
                      "Nhập mã kho",
                  },
                  {
                    pattern:
                      /^[A-Za-z0-9_]+$/,
                    message:
                      "Chỉ dùng chữ, số và dấu _",
                  },
                ]}
              >
                <Input
                  maxLength={50}
                  placeholder="KHO_PHU_01"
                  onChange={(event) => {
                    form.setFieldValue(
                      "warehouse_code",
                      event.target.value
                        .toUpperCase()
                        .replace(
                          /[^A-Z0-9_]/g,
                          "",
                        ),
                    );
                  }}
                />
              </Form.Item>
            </Col>

            <Col
              xs={24}
              md={12}
            >
              <Form.Item
                label="Tên kho"
                name="name"
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message:
                      "Nhập tên kho",
                  },
                ]}
              >
                <Input
                  maxLength={150}
                  placeholder="Kho phụ 01"
                />
              </Form.Item>
            </Col>

            <Col xs={24}>
              <Form.Item
                label="Loại kho"
                name="warehouse_type"
                extra={
                  editingWarehouse
                    ? "Kho đã phát sinh nghiệp vụ sẽ không được đổi loại."
                    : undefined
                }
                rules={[
                  {
                    required: true,
                    message:
                      "Chọn loại kho",
                  },
                ]}
              >
                <Select
                  options={warehouseTypes.map(
                    (item) => ({
                      value:
                        item.type_code,

                      label:
                        `${item.type_name} (${item.type_code})`,
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
                label="Quyền nhập từ NCC"
                name="can_receive_purchase_mode"
                rules={[
                  {
                    required: true,
                    message:
                      "Chọn quyền nhập từ NCC",
                  },
                ]}
                extra="Theo loại kho = kế thừa quyền mặc định của loại kho."
              >
                <Select
                  options={[
                    {
                      value:
                        "INHERIT",
                      label:
                        "Theo loại kho",
                    },
                    {
                      value:
                        "ALLOW",
                      label:
                        "Cho phép",
                    },
                    {
                      value:
                        "DENY",
                      label:
                        "Không cho phép",
                    },
                  ]}
                />
              </Form.Item>
            </Col>

            <Col
              xs={24}
              md={12}
            >
              <Form.Item
                label="Quyền bán thuốc"
                name="can_sell_mode"
                rules={[
                  {
                    required: true,
                    message:
                      "Chọn quyền bán thuốc",
                  },
                ]}
                extra="Theo loại kho = kế thừa quyền mặc định của loại kho."
              >
                <Select
                  options={[
                    {
                      value:
                        "INHERIT",
                      label:
                        "Theo loại kho",
                    },
                    {
                      value:
                        "ALLOW",
                      label:
                        "Cho phép",
                    },
                    {
                      value:
                        "DENY",
                      label:
                        "Không cho phép",
                    },
                  ]}
                />
              </Form.Item>
            </Col>

            <Col xs={24}>
              <Form.Item
                label="Mô tả"
                name="description"
              >
                <Input.TextArea
                  rows={4}
                  maxLength={500}
                  showCount
                  placeholder="Mô tả mục đích sử dụng của kho..."
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

export default Warehouses;
