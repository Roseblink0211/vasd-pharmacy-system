import { useEffect, useMemo, useState } from "react";

import {
  CheckCircleOutlined,
  EditOutlined,
  KeyOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  TeamOutlined,
  UnlockOutlined,
} from "@ant-design/icons";

import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
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

interface Position {
  id: number;
  position_code: string;
  position_name: string;
  description?: string | null;
}

interface Permission {
  permission_code: string;
  permission_name: string;
  module_code: string;
  description?: string | null;
}

interface Warehouse {
  id: number;
  warehouse_code?: string;
  name: string;
  warehouse_type?: string;
}

interface ManagedUser {
  id: number;
  full_name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  is_active: boolean;

  position?: {
    id?: number;
    position_code?: string;
    position_name?: string;
  } | null;

  warehouse_count?: number | string;
  permission_count?: number | string;
  last_login_at?: string | null;
}

interface AccessPermission {
  permission_code: string;
  permission_name: string;
  module_code: string;
  position_allowed?: boolean;
  override?: boolean | null;
  effective_allowed?: boolean;
}

interface AccessWarehouse {
  id: number;
  warehouse_code?: string;
  name: string;
  warehouse_type?: string;
  assigned?: boolean;
  effective_allowed?: boolean;
}

interface UserAccessResponse {
  success?: boolean;
  user?: ManagedUser;
  permissions?: AccessPermission[];
  warehouses?: AccessWarehouse[];
  message?: string;
}

interface CreateUserValues {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
  address?: string;
  position_id: number;
  warehouse_ids?: number[];
}

interface EditUserValues {
  full_name: string;
  email: string;
  phone?: string;
  address?: string;
}

interface ResetPasswordValues {
  new_password: string;
  confirm_password: string;
}

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

  const object =
    data as Record<string, unknown>;

  for (const key of keys) {
    if (Array.isArray(object[key])) {
      return object[key] as T[];
    }
  }

  return [];
}

function apiMessage(
  error: unknown,
  fallback: string,
) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const response = (
      error as {
        response?: {
          data?: {
            detail?: string;
            message?: string;
          };
        };
      }
    ).response;

    return (
      response?.data?.detail ||
      response?.data?.message ||
      fallback
    );
  }

  return fallback;
}

function formatDateTime(
  value?: string | null,
) {
  if (!value) return "-";

  const date = dayjs(value);

  return date.isValid()
    ? date.format("DD/MM/YYYY HH:mm")
    : value;
}

function moduleLabel(
  moduleCode: string,
) {
  const labels: Record<string, string> = {
    DASHBOARD: "Dashboard",
    MEDICINE: "Thuốc",
    SUPPLIER: "Nhà cung cấp",
    WAREHOUSE: "Kho",
    PURCHASE: "Nhập thuốc",
    INVENTORY: "Tồn kho",
    TRANSFER: "Chuyển kho",
    SALES: "Bán thuốc",
    CUSTOMER: "Khách hàng",
    CUSTOMER_RETURN: "Hoàn khách hàng",
    SUPPLIER_RETURN: "Trả NCC",
    STOCK_HISTORY: "Lịch sử kho",
    USER: "Người dùng",
  };

  return labels[moduleCode] || moduleCode;
}

function UserManagement() {
  const [createForm] =
    Form.useForm<CreateUserValues>();

  const [editForm] =
    Form.useForm<EditUserValues>();

  const [resetForm] =
    Form.useForm<ResetPasswordValues>();

  const [users, setUsers] =
    useState<ManagedUser[]>([]);

  const [positions, setPositions] =
    useState<Position[]>([]);

  const [permissions, setPermissions] =
    useState<Permission[]>([]);

  const [warehouses, setWarehouses] =
    useState<Warehouse[]>([]);

  const [myPermissions, setMyPermissions] =
    useState<string[]>([]);

  const [myUserId, setMyUserId] =
    useState<number | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState<boolean | undefined>();

  const [createOpen, setCreateOpen] =
    useState(false);

  const [editOpen, setEditOpen] =
    useState(false);

  const [resetOpen, setResetOpen] =
    useState(false);

  const [accessOpen, setAccessOpen] =
    useState(false);

  const [selectedUser, setSelectedUser] =
    useState<ManagedUser | null>(null);

  const [accessLoading, setAccessLoading] =
    useState(false);

  const [accessData, setAccessData] =
    useState<UserAccessResponse | null>(
      null,
    );

  const [positionId, setPositionId] =
    useState<number | undefined>();

  const [warehouseIds, setWarehouseIds] =
    useState<number[]>([]);

  const [allowedCodes, setAllowedCodes] =
    useState<string[]>([]);

  const [deniedCodes, setDeniedCodes] =
    useState<string[]>([]);

  const canManage =
    myPermissions.includes(
      "USER_MANAGE",
    );

  const filteredUsers = useMemo(() => {
    const keyword =
      search.trim().toLowerCase();

    return users.filter((user) => {
      if (
        statusFilter !== undefined &&
        user.is_active !== statusFilter
      ) {
        return false;
      }

      if (!keyword) return true;

      return [
        user.full_name,
        user.email,
        user.phone || "",
        user.position?.position_name || "",
        user.position?.position_code || "",
      ].some((value) =>
        value
          .toLowerCase()
          .includes(keyword),
      );
    });
  }, [
    users,
    search,
    statusFilter,
  ]);

  const effectivePermissions =
    useMemo(
      () =>
        (accessData?.permissions || [])
          .filter(
            (permission) =>
              permission.effective_allowed,
          ),
      [accessData],
    );


  const effectivePermissionsByModule =
    useMemo(() => {
      const groups = new Map<
        string,
        AccessPermission[]
      >();

      effectivePermissions.forEach(
        (permission) => {
          const key =
            permission.module_code ||
            "OTHER";

          const current =
            groups.get(key) || [];

          current.push(permission);

          groups.set(
            key,
            current,
          );
        },
      );

      return Array.from(
        groups.entries(),
      ).sort(([a], [b]) =>
        moduleLabel(a).localeCompare(
          moduleLabel(b),
          "vi",
        ),
      );
    }, [effectivePermissions]);

  const activeCount =
    users.filter(
      (user) => user.is_active,
    ).length;

  const adminCount =
    users.filter(
      (user) =>
        user.is_active &&
        user.position?.position_code ===
          "ADMIN",
    ).length;

  const loadAll = async () => {
    try {
      setLoading(true);

      const [
        usersResponse,
        positionsResponse,
        permissionsResponse,
        warehousesResponse,
        meResponse,
      ] = await Promise.all([
        api.get("/admin/users"),
        api.get("/admin/positions", {
          params: {
            is_active: true,
          },
        }),
        api.get("/admin/permissions"),
        api.get("/admin/warehouses"),
        api.get("/users/me"),
      ]);

      if (
        usersResponse.data?.success ===
        true
      ) {
        setUsers(
          normalizeArray<ManagedUser>(
            usersResponse.data,
            ["data", "users"],
          ),
        );
      }

      if (
        positionsResponse.data
          ?.success === true
      ) {
        setPositions(
          normalizeArray<Position>(
            positionsResponse.data,
            ["data", "positions"],
          ),
        );
      }

      if (
        permissionsResponse.data
          ?.success === true
      ) {
        setPermissions(
          normalizeArray<Permission>(
            permissionsResponse.data,
            ["data", "permissions"],
          ),
        );
      }

      if (
        warehousesResponse.data
          ?.success === true
      ) {
        setWarehouses(
          normalizeArray<Warehouse>(
            warehousesResponse.data,
            ["data", "warehouses"],
          ),
        );
      }

      const codes =
        Array.isArray(
          meResponse.data?.permissions,
        )
          ? (
              meResponse.data
                .permissions as unknown[]
            ).filter(
              (
                value,
              ): value is string =>
                typeof value ===
                "string",
            )
          : [];

      setMyPermissions(codes);

      const id = Number(
        meResponse.data?.user?.id,
      );

      setMyUserId(
        Number.isFinite(id)
          ? id
          : null,
      );
    } catch (error) {
      console.error(
        "Load users:",
        error,
      );

      message.error(
        apiMessage(
          error,
          "Không thể tải dữ liệu người dùng",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleCreate = async (
    values: CreateUserValues,
  ) => {
    try {
      setSaving(true);

      const response = await api.post(
        "/admin/users",
        {
          full_name:
            values.full_name.trim(),
          email:
            values.email
              .trim()
              .toLowerCase(),
          password: values.password,
          phone:
            values.phone
              ?.replace(/\D/g, "") ||
            null,
          address:
            values.address?.trim() ||
            null,
          position_id:
            values.position_id,
          warehouse_ids:
            values.warehouse_ids || [],
        },
      );

      if (
        response.data?.success !== true
      ) {
        message.error(
          response.data?.message ||
            "Không thể tạo tài khoản",
        );
        return;
      }

      message.success(
        "Đã tạo tài khoản",
      );

      setCreateOpen(false);
      createForm.resetFields();

      await loadAll();
    } catch (error) {
      message.error(
        apiMessage(
          error,
          "Có lỗi khi tạo tài khoản",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (
    user: ManagedUser,
  ) => {
    setSelectedUser(user);

    editForm.setFieldsValue({
      full_name: user.full_name,
      email: user.email,
      phone:
        user.phone || undefined,
      address:
        user.address || undefined,
    });

    setEditOpen(true);
  };

  const handleUpdate = async (
    values: EditUserValues,
  ) => {
    if (!selectedUser) return;

    try {
      setSaving(true);

      const response = await api.put(
        `/admin/users/${selectedUser.id}`,
        {
          full_name:
            values.full_name.trim(),
          email:
            values.email
              .trim()
              .toLowerCase(),
          phone:
            values.phone
              ?.replace(/\D/g, "") ||
            null,
          address:
            values.address?.trim() ||
            null,
        },
      );

      if (
        response.data?.success !== true
      ) {
        message.error(
          response.data?.message ||
            "Không thể cập nhật",
        );
        return;
      }

      message.success(
        "Đã cập nhật người dùng",
      );

      setEditOpen(false);
      setSelectedUser(null);
      editForm.resetFields();

      await loadAll();
    } catch (error) {
      message.error(
        apiMessage(
          error,
          "Có lỗi khi cập nhật",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (
    user: ManagedUser,
    isActive: boolean,
  ) => {
    try {
      const response = await api.patch(
        `/admin/users/${user.id}/status`,
        {
          is_active: isActive,
        },
      );

      if (
        response.data?.success !== true
      ) {
        message.error(
          response.data?.message ||
            "Không thể đổi trạng thái",
        );
        return;
      }

      message.success(
        response.data?.message ||
          "Đã cập nhật trạng thái",
      );

      await loadAll();
    } catch (error) {
      message.error(
        apiMessage(
          error,
          "Có lỗi khi đổi trạng thái",
        ),
      );
    }
  };

  const openReset = (
    user: ManagedUser,
  ) => {
    setSelectedUser(user);
    resetForm.resetFields();
    setResetOpen(true);
  };

  const handleReset = async (
    values: ResetPasswordValues,
  ) => {
    if (!selectedUser) return;

    try {
      setSaving(true);

      const response = await api.put(
        `/admin/users/${selectedUser.id}/reset-password`,
        {
          new_password:
            values.new_password,
        },
      );

      if (
        response.data?.success !== true
      ) {
        message.error(
          response.data?.message ||
            "Không thể đặt lại mật khẩu",
        );
        return;
      }

      message.success(
        response.data?.message ||
          "Đã đặt lại mật khẩu",
      );

      setResetOpen(false);
      setSelectedUser(null);
      resetForm.resetFields();
    } catch (error) {
      message.error(
        apiMessage(
          error,
          "Có lỗi khi đặt lại mật khẩu",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const openAccess = async (
    user: ManagedUser,
  ) => {
    try {
      setSelectedUser(user);
      setAccessOpen(true);
      setAccessLoading(true);

      const response = await api.get(
        `/admin/users/${user.id}/access`,
      );

      if (
        response.data?.success !== true
      ) {
        message.error(
          response.data?.message ||
            "Không thể tải quyền",
        );
        return;
      }

      const data =
        response.data as UserAccessResponse;

      setAccessData(data);

      setPositionId(
        data.user?.position?.id,
      );

      setWarehouseIds(
        (data.warehouses || [])
          .filter(
            (warehouse) =>
              warehouse.assigned,
          )
          .map(
            (warehouse) =>
              warehouse.id,
          ),
      );

      setAllowedCodes(
        (data.permissions || [])
          .filter(
            (permission) =>
              permission.override ===
              true,
          )
          .map(
            (permission) =>
              permission.permission_code,
          ),
      );

      setDeniedCodes(
        (data.permissions || [])
          .filter(
            (permission) =>
              permission.override ===
              false,
          )
          .map(
            (permission) =>
              permission.permission_code,
          ),
      );
    } catch (error) {
      message.error(
        apiMessage(
          error,
          "Có lỗi khi tải quyền",
        ),
      );
    } finally {
      setAccessLoading(false);
    }
  };

  const handleSaveAccess = async () => {
    if (
      !selectedUser ||
      !positionId
    ) {
      message.warning(
        "Vui lòng chọn chức vụ",
      );
      return;
    }

    const overlap =
      allowedCodes.filter((code) =>
        deniedCodes.includes(code),
      );

    if (overlap.length > 0) {
      message.warning(
        "Một quyền không thể vừa cấp thêm vừa thu hồi",
      );
      return;
    }

    try {
      setSaving(true);

      const positionResponse =
        await api.put(
          `/admin/users/${selectedUser.id}/position`,
          {
            position_id:
              positionId,
          },
        );

      if (
        positionResponse.data
          ?.success !== true
      ) {
        message.error(
          positionResponse.data
            ?.message ||
            "Không thể đổi chức vụ",
        );
        return;
      }

      const warehouseResponse =
        await api.put(
          `/admin/users/${selectedUser.id}/warehouses`,
          {
            warehouse_ids:
              warehouseIds,
          },
        );

      if (
        warehouseResponse.data
          ?.success !== true
      ) {
        message.error(
          warehouseResponse.data
            ?.message ||
            "Không thể cập nhật kho",
        );
        return;
      }

      const permissionResponse =
        await api.put(
          `/admin/users/${selectedUser.id}/permission-overrides`,
          {
            allowed_codes:
              allowedCodes,
            denied_codes:
              deniedCodes,
          },
        );

      if (
        permissionResponse.data
          ?.success !== true
      ) {
        message.error(
          permissionResponse.data
            ?.message ||
            "Không thể cập nhật quyền",
        );
        return;
      }

      message.success(
        "Đã lưu phân quyền",
      );

      await loadAll();
      await openAccess(
        selectedUser,
      );
    } catch (error) {
      message.error(
        apiMessage(
          error,
          "Có lỗi khi lưu phân quyền",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const permissionOptions =
    permissions.map(
      (permission) => ({
        value:
          permission.permission_code,
        label: `${moduleLabel(
          permission.module_code,
        )} - ${
          permission.permission_name
        } (${permission.permission_code})`,
      }),
    );

  const columns: TableColumnsType<ManagedUser> =
    [
      {
        title: "STT",
        key: "stt",
        width: 60,
        align: "center",
        render: (_, __, index) =>
          index + 1,
      },
      {
        title: "Người dùng",
        key: "user",
        width: 230,
        render: (_, user) => (
          <div>
            <Text strong>
              {user.full_name}
            </Text>
            <br />
            <Text type="secondary">
              {user.email}
            </Text>
          </div>
        ),
      },
      {
        title: "SĐT",
        dataIndex: "phone",
        key: "phone",
        width: 125,
        render: (value) =>
          value || "-",
      },
      {
        title: "Chức vụ",
        key: "position",
        width: 190,
        render: (_, user) => (
          <Tag color="blue">
            {user.position
              ?.position_name ||
              "Chưa gán"}
          </Tag>
        ),
      },
      {
        title: "Kho phụ trách",
        dataIndex:
          "warehouse_count",
        key: "warehouse_count",
        width: 105,
        align: "center",
        render: (value) => (
          <Text>
            {Number(value || 0)} kho
          </Text>
        ),
      },
      {
        title: "Quyền hiệu lực",
        dataIndex:
          "permission_count",
        key: "permission_count",
        width: 120,
        align: "center",
        render: (value) => (
          <Tag color="green">
            {Number(value || 0)} quyền
          </Tag>
        ),
      },
      {
        title: "Đăng nhập gần nhất",
        dataIndex:
          "last_login_at",
        key: "last_login_at",
        width: 170,
        render: (value) =>
          formatDateTime(value),
      },
      {
        title: "Trạng thái",
        key: "status",
        width: 115,
        render: (_, user) =>
          user.is_active ? (
            <Tag
              color="green"
              icon={
                <CheckCircleOutlined />
              }
            >
              Hoạt động
            </Tag>
          ) : (
            <Tag
              color="red"
              icon={
                <LockOutlined />
              }
            >
              Đã khóa
            </Tag>
          ),
      },
      {
        title: "Thao tác",
        key: "actions",
        fixed: "right",
        width: 340,
        render: (_, user) => (
          <Space wrap>
            <Button
              size="small"
              icon={
                <SafetyCertificateOutlined />
              }
              onClick={() =>
                void openAccess(user)
              }
            >
              Phân quyền
            </Button>

            {canManage && (
              <>
                <Button
                  size="small"
                  icon={
                    <EditOutlined />
                  }
                  onClick={() =>
                    openEdit(user)
                  }
                >
                  Sửa
                </Button>

                <Button
                  size="small"
                  icon={
                    <KeyOutlined />
                  }
                  onClick={() =>
                    openReset(user)
                  }
                >
                  Mật khẩu
                </Button>

                <Popconfirm
                  title={
                    user.is_active
                      ? "Khóa tài khoản?"
                      : "Mở khóa tài khoản?"
                  }
                  description={
                    user.is_active
                      ? "Token đang hoạt động sẽ bị thu hồi."
                      : "Tài khoản có thể đăng nhập lại."
                  }
                  okText={
                    user.is_active
                      ? "Khóa"
                      : "Mở khóa"
                  }
                  cancelText="Hủy"
                  disabled={
                    user.id === myUserId
                  }
                  onConfirm={() =>
                    void handleStatus(
                      user,
                      !user.is_active,
                    )
                  }
                >
                  <Button
                    size="small"
                    danger={
                      user.is_active
                    }
                    disabled={
                      user.id ===
                      myUserId
                    }
                    icon={
                      user.is_active ? (
                        <LockOutlined />
                      ) : (
                        <UnlockOutlined />
                      )
                    }
                  >
                    {user.is_active
                      ? "Khóa"
                      : "Mở"}
                  </Button>
                </Popconfirm>
              </>
            )}
          </Space>
        ),
      },
    ];

  return (
    <div>
      <Space
        direction="vertical"
        size={4}
        style={{
          marginBottom: 20,
        }}
      >
        <Title
          level={2}
          style={{ margin: 0 }}
        >
          Quản lý người dùng
        </Title>

        <Text type="secondary">
          Tài khoản, chức vụ, quyền chức năng và phạm vi kho.
        </Text>
      </Space>

      <Alert
        showIcon
        type="info"
        style={{
          marginBottom: 16,
        }}
        message="Backend vẫn là lớp bảo mật cuối cùng"
        description="Menu được ẩn theo quyền để giao diện gọn hơn. Nếu tự gọi API trái quyền, FastAPI vẫn trả HTTP 403."
      />

      <Row
        gutter={[16, 16]}
        style={{
          marginBottom: 16,
        }}
      >
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Tổng tài khoản"
              value={users.length}
              prefix={
                <TeamOutlined />
              }
            />
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Đang hoạt động"
              value={activeCount}
            />
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Admin hoạt động"
              value={adminCount}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Row
          gutter={[12, 12]}
          style={{
            marginBottom: 16,
          }}
        >
          <Col xs={24} md={10}>
            <Input
              allowClear
              prefix={
                <SearchOutlined />
              }
              placeholder="Tên, email, SĐT, chức vụ..."
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value,
                )
              }
            />
          </Col>

          <Col xs={24} md={5}>
            <Select
              allowClear
              placeholder="Trạng thái"
              style={{
                width: "100%",
              }}
              value={statusFilter}
              onChange={
                setStatusFilter
              }
              options={[
                {
                  value: true,
                  label: "Hoạt động",
                },
                {
                  value: false,
                  label: "Đã khóa",
                },
              ]}
            />
          </Col>

          <Col xs={24} md={9}>
            <Space wrap>
              <Button
                icon={
                  <ReloadOutlined />
                }
                onClick={() =>
                  void loadAll()
                }
              >
                Làm mới
              </Button>

              {canManage && (
                <Button
                  type="primary"
                  icon={
                    <PlusOutlined />
                  }
                  onClick={() => {
                    createForm.resetFields();
                    setCreateOpen(
                      true,
                    );
                  }}
                >
                  Thêm người dùng
                </Button>
              )}
            </Space>
          </Col>
        </Row>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={filteredUsers}
          columns={columns}
          scroll={{ x: 1400 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
          }}
        />
      </Card>

      <Modal
        title="Thêm người dùng"
        open={createOpen}
        width={720}
        okText="Tạo tài khoản"
        cancelText="Hủy"
        confirmLoading={saving}
        destroyOnHidden
        onOk={() =>
          createForm.submit()
        }
        onCancel={() => {
          if (saving) return;
          setCreateOpen(false);
          createForm.resetFields();
        }}
      >
        <Form
          form={createForm}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) =>
            void handleCreate(values)
          }
        >
          <Row gutter={16}>
            <Col xs={24} md={12}>
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
                <Input />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="Email đăng nhập"
                name="email"
                rules={[
                  {
                    required: true,
                    message:
                      "Vui lòng nhập email",
                  },
                  {
                    type: "email",
                    message:
                      "Email không hợp lệ",
                  },
                ]}
              >
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Mật khẩu ban đầu"
                name="password"
                rules={[
                  {
                    required: true,
                    message:
                      "Vui lòng nhập mật khẩu",
                  },
                  {
                    validator: async (
                      _,
                      value,
                    ) => {
                      if (!value) return;

                      if (
                        value.length < 8 ||
                        !/[A-Za-z]/.test(
                          value,
                        ) ||
                        !/[0-9]/.test(
                          value,
                        ) ||
                        !/[^A-Za-z0-9\s]/.test(
                          value,
                        ) ||
                        /\s/.test(value)
                      ) {
                        throw new Error(
                          "Ít nhất 8 ký tự, có chữ, số, ký tự đặc biệt và không có khoảng trắng",
                        );
                      }
                    },
                  },
                ]}
              >
                <Input.Password />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="Số điện thoại"
                name="phone"
              >
                <Input maxLength={10} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="Địa chỉ"
            name="address"
          >
            <Input.TextArea
              rows={2}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} md={10}>
              <Form.Item
                label="Chức vụ"
                name="position_id"
                rules={[
                  {
                    required: true,
                    message:
                      "Vui lòng chọn chức vụ",
                  },
                ]}
              >
                <Select
                  options={positions.map(
                    (position) => ({
                      value:
                        position.id,
                      label: `${position.position_name} (${position.position_code})`,
                    }),
                  )}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={14}>
              <Form.Item
                label="Kho được phân công"
                name="warehouse_ids"
                extra="Admin có WAREHOUSE_ALL_ACCESS nên có thể để trống."
              >
                <Select
                  mode="multiple"
                  allowClear
                  options={warehouses.map(
                    (warehouse) => ({
                      value:
                        warehouse.id,
                      label: `${
                        warehouse.warehouse_code ||
                        `KHO-${warehouse.id}`
                      } - ${warehouse.name}`,
                    }),
                  )}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="Sửa người dùng"
        open={editOpen}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={saving}
        destroyOnHidden
        onOk={() =>
          editForm.submit()
        }
        onCancel={() => {
          if (saving) return;
          setEditOpen(false);
          setSelectedUser(null);
        }}
      >
        <Form
          form={editForm}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) =>
            void handleUpdate(values)
          }
        >
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
            <Input />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
            rules={[
              {
                required: true,
                type: "email",
                message:
                  "Email không hợp lệ",
              },
            ]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="Số điện thoại"
            name="phone"
          >
            <Input maxLength={10} />
          </Form.Item>

          <Form.Item
            label="Địa chỉ"
            name="address"
          >
            <Input.TextArea
              rows={2}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Đặt lại mật khẩu"
        open={resetOpen}
        okText="Đặt lại"
        cancelText="Hủy"
        confirmLoading={saving}
        destroyOnHidden
        onOk={() =>
          resetForm.submit()
        }
        onCancel={() => {
          if (saving) return;
          setResetOpen(false);
          setSelectedUser(null);
        }}
      >
        <Alert
          showIcon
          type="warning"
          style={{
            marginBottom: 16,
          }}
          message="Sau khi reset, toàn bộ token của tài khoản sẽ bị thu hồi."
        />

        <Form
          form={resetForm}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) =>
            void handleReset(values)
          }
        >
          <Form.Item
            label="Mật khẩu mới"
            name="new_password"
            rules={[
              {
                required: true,
                message:
                  "Vui lòng nhập mật khẩu mới",
              },
            ]}
          >
            <Input.Password />
          </Form.Item>

          <Form.Item
            label="Nhập lại mật khẩu"
            name="confirm_password"
            dependencies={[
              "new_password",
            ]}
            rules={[
              {
                required: true,
                message:
                  "Vui lòng nhập lại mật khẩu",
              },
              {
                validator: async (
                  _,
                  value,
                ) => {
                  if (
                    value !==
                    resetForm.getFieldValue(
                      "new_password",
                    )
                  ) {
                    throw new Error(
                      "Mật khẩu không khớp",
                    );
                  }
                },
              },
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={
          selectedUser
            ? `Phân quyền người dùng - ${selectedUser.full_name}`
            : "Phân quyền người dùng"
        }
        open={accessOpen}
        width={820}
        loading={accessLoading}
        onClose={() => {
          if (saving) return;
          setAccessOpen(false);
          setSelectedUser(null);
          setAccessData(null);
        }}
        extra={
          canManage ? (
            <Button
              type="primary"
              loading={saving}
              onClick={() =>
                void handleSaveAccess()
              }
            >
              Lưu phân quyền
            </Button>
          ) : null
        }
      >
        {accessData?.user && (
          <>
            <Descriptions
              bordered
              size="small"
              column={2}
              style={{
                marginBottom: 16,
              }}
            >
              <Descriptions.Item label="Họ tên">
                {
                  accessData.user
                    .full_name
                }
              </Descriptions.Item>

              <Descriptions.Item label="Email">
                {
                  accessData.user
                    .email
                }
              </Descriptions.Item>

              <Descriptions.Item label="Chức vụ">
                {
                  accessData.user
                    .position
                    ?.position_name ||
                  "-"
                }
              </Descriptions.Item>

              <Descriptions.Item label="Trạng thái">
                {accessData.user
                  .is_active
                  ? "Hoạt động"
                  : "Đã khóa"}
              </Descriptions.Item>
            </Descriptions>

            <Alert
              showIcon
              type="info"
              style={{
                marginBottom: 16,
              }}
              message="Cách hệ thống tính quyền"
              description="Chức vụ cung cấp bộ quyền mặc định. Danh sách kho giới hạn phạm vi kho được thao tác. Phần Điều chỉnh quyền riêng chỉ dùng khi cần cấp thêm hoặc thu hồi một quyền cụ thể cho người dùng này. Quyền hiệu lực ở cuối là kết quả cuối cùng mà tài khoản thực sự được phép sử dụng."
            />

            <Card
              size="small"
              title="Chức vụ và quyền mặc định"
              style={{
                marginBottom: 16,
              }}
            >
              <Select
                disabled={!canManage}
                value={positionId}
                onChange={
                  setPositionId
                }
                style={{
                  width: "100%",
                }}
                options={positions.map(
                  (position) => ({
                    value:
                      position.id,
                    label: `${position.position_name} (${position.position_code})`,
                  }),
                )}
              />
            </Card>

            <Card
              size="small"
              title="Kho được phép thao tác"
              style={{
                marginBottom: 16,
              }}
            >
              <Select
                mode="multiple"
                allowClear
                disabled={!canManage}
                value={warehouseIds}
                onChange={
                  setWarehouseIds
                }
                style={{
                  width: "100%",
                }}
                options={warehouses.map(
                  (warehouse) => ({
                    value:
                      warehouse.id,
                    label: `${
                      warehouse.warehouse_code ||
                      `KHO-${warehouse.id}`
                    } - ${warehouse.name}`,
                  }),
                )}
              />

              <Text
                type="secondary"
                style={{
                  display: "block",
                  marginTop: 8,
                }}
              >
                Nếu tài khoản có quyền “Toàn quyền kho”, hệ thống có thể bỏ qua giới hạn danh sách kho bên trên.
              </Text>
            </Card>

            <Card
              size="small"
              title="Điều chỉnh quyền riêng"
              style={{
                marginBottom: 16,
              }}
            >
              <Form layout="vertical">
                <Form.Item label="Cấp thêm ngoài quyền của chức vụ">
                  <Select
                    mode="multiple"
                    allowClear
                    disabled={!canManage}
                    value={allowedCodes}
                    onChange={
                      setAllowedCodes
                    }
                    options={
                      permissionOptions
                    }
                    optionFilterProp="label"
                  />
                </Form.Item>

                <Form.Item label="Thu hồi dù chức vụ đang có">
                  <Select
                    mode="multiple"
                    allowClear
                    disabled={!canManage}
                    value={deniedCodes}
                    onChange={
                      setDeniedCodes
                    }
                    options={
                      permissionOptions
                    }
                    optionFilterProp="label"
                  />
                </Form.Item>
              </Form>

              <Alert
                showIcon
                type="warning"
                message="Quyền riêng được ưu tiên hơn quyền mặc định của chức vụ."
                description="Chỉ nên dùng phần này cho trường hợp ngoại lệ. Nếu không cần ngoại lệ, hãy để cả hai danh sách trống và quản lý quyền bằng Chức vụ."
              />
            </Card>

            <Card
              size="small"
              title={`Quyền hiệu lực (${effectivePermissions.length} quyền)`}
            >
              {effectivePermissionsByModule.length ===
              0 ? (
                <Text type="secondary">
                  Tài khoản hiện chưa có quyền hiệu lực.
                </Text>
              ) : (
                <Space
                  direction="vertical"
                  size={12}
                  style={{
                    width: "100%",
                  }}
                >
                  {effectivePermissionsByModule.map(
                    ([
                      moduleCode,
                      modulePermissions,
                    ]) => (
                      <div
                        key={moduleCode}
                      >
                        <Text
                          strong
                          style={{
                            display:
                              "block",
                            marginBottom: 6,
                          }}
                        >
                          {moduleLabel(
                            moduleCode,
                          )}
                        </Text>

                        <Space wrap>
                          {modulePermissions.map(
                            (
                              permission,
                            ) => (
                              <Tag
                                color="green"
                                key={
                                  permission.permission_code
                                }
                              >
                                {
                                  permission.permission_name
                                }
                              </Tag>
                            ),
                          )}
                        </Space>
                      </div>
                    ),
                  )}
                </Space>
              )}
            </Card>
          </>
        )}
      </Drawer>
    </div>
  );
}

export default UserManagement;
