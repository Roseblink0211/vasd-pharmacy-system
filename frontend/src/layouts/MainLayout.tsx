import { useEffect, useMemo, useState } from "react";

import {
  AppstoreOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  HistoryOutlined,
  ImportOutlined,
  LogoutOutlined,
  MedicineBoxOutlined,
  RetweetOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  SwapOutlined,
  TeamOutlined,
  TruckOutlined,
  UndoOutlined,
  UserOutlined,
  HomeOutlined,
} from "@ant-design/icons";

import {
  Avatar,
  Button,
  Layout,
  Menu,
  Space,
  Typography,
} from "antd";

import type { MenuProps } from "antd";

import {
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import api from "../api/api";

const { Header, Sider, Content } = Layout;
const { Text, Title } = Typography;

interface CurrentUser {
  id?: number;
  full_name?: string;
  email?: string;
  phone?: string | null;
  address?: string | null;
  is_active?: boolean;

  position?: {
    id?: number;
    position_code?: string;
    position_name?: string;
  } | null;
}

function getStoredUser(): CurrentUser | null {
  try {
    const value =
      localStorage.getItem("user");

    if (!value) {
      return null;
    }

    return JSON.parse(
      value,
    ) as CurrentUser;
  } catch {
    return null;
  }
}

function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [
    currentUser,
    setCurrentUser,
  ] = useState<CurrentUser | null>(
    getStoredUser,
  );

  const [
    permissions,
    setPermissions,
  ] = useState<string[]>([]);

  const hasPermission = (
    code: string,
  ) => permissions.includes(code);

  const menuItems =
    useMemo<MenuProps["items"]>(() => {
      const catalogChildren:
        NonNullable<
          MenuProps["items"]
        > = [];

      if (
        hasPermission(
          "MEDICINE_VIEW",
        )
      ) {
        catalogChildren.push({
          key: "/medicines",
          icon: (
            <MedicineBoxOutlined />
          ),
          label: "Thuốc",
        });
      }

      if (
        hasPermission(
          "SUPPLIER_VIEW",
        )
      ) {
        catalogChildren.push({
          key: "/suppliers",
          icon: <TruckOutlined />,
          label: "Nhà cung cấp",
        });
      }

      if (
        hasPermission(
          "WAREHOUSE_VIEW",
        )
      ) {
        catalogChildren.push({
          key: "/warehouses",
          icon: <HomeOutlined />,
          label: "Kho",
        });
      }

      const warehouseChildren:
        NonNullable<
          MenuProps["items"]
        > = [];

      if (
        hasPermission(
          "PURCHASE_VIEW",
        )
      ) {
        warehouseChildren.push({
          key: "/purchase-receipts",
          icon: <ImportOutlined />,
          label: "Nhập thuốc",
        });
      }

      if (
        hasPermission(
          "INVENTORY_VIEW",
        )
      ) {
        warehouseChildren.push({
          key: "/inventory",
          icon: <DatabaseOutlined />,
          label: "Tồn kho",
        });
      }

      if (
        hasPermission(
          "TRANSFER_VIEW",
        )
      ) {
        warehouseChildren.push({
          key: "/warehouse-transfers",
          icon: <SwapOutlined />,
          label: "Chuyển kho",
        });
      }

      if (
        hasPermission(
          "SALES_VIEW",
        )
      ) {
        warehouseChildren.push({
          key: "/sales",
          icon: (
            <ShoppingCartOutlined />
          ),
          label: "Bán thuốc",
        });
      }

      if (
        hasPermission(
          "SALES_RETURN_VIEW",
        )
      ) {
        warehouseChildren.push({
          key: "/customer-returns",
          icon: <UndoOutlined />,
          label: "Hoàn khách hàng",
        });
      }

      if (
        hasPermission(
          "TRANSFER_APPROVE",
        ) ||
        hasPermission(
          "SUPPLIER_RETURN_APPROVE",
        )
      ) {
        warehouseChildren.push({
          key: "/approval-requests",
          icon: (
            <AppstoreOutlined />
          ),
          label: "Duyệt yêu cầu",
        });
      }

      if (
        hasPermission(
          "SUPPLIER_RETURN_VIEW",
        )
      ) {
        warehouseChildren.push({
          key: "/supplier-returns",
          icon: <RetweetOutlined />,
          label: "Trả NCC",
        });
      }

      if (
        hasPermission(
          "STOCK_HISTORY_VIEW",
        )
      ) {
        warehouseChildren.push({
          key: "/stock-movements",
          icon: <HistoryOutlined />,
          label: "Lịch sử kho",
        });
      }

      const systemChildren:
        NonNullable<
          MenuProps["items"]
        > = [];

      if (
        hasPermission(
          "USER_VIEW",
        ) ||
        hasPermission(
          "USER_MANAGE",
        )
      ) {
        systemChildren.push({
          key: "/user-management",
          icon: <TeamOutlined />,
          label:
            "Quản lý người dùng",
        });
      }

      const result:
        NonNullable<
          MenuProps["items"]
        > = [];

      if (
        hasPermission(
          "DASHBOARD_VIEW",
        )
      ) {
        result.push({
          key: "/dashboard",
          icon: (
            <DashboardOutlined />
          ),
          label: "Dashboard",
        });
      }

      if (
        catalogChildren.length >
        0
      ) {
        result.push({
          type: "group",
          label: "DANH MỤC",
          children:
            catalogChildren,
        });
      }

      if (
        warehouseChildren.length >
        0
      ) {
        result.push({
          type: "group",
          label: "QUẢN LÝ KHO",
          children:
            warehouseChildren,
        });
      }

      if (
        systemChildren.length > 0
      ) {
        result.push({
          type: "group",
          label: "HỆ THỐNG",
          children:
            systemChildren,
        });
      }

      return result;
    }, [permissions]);

  useEffect(() => {
    let cancelled = false;

    const loadCurrentUser =
      async () => {
        try {
          const response =
            await api.get(
              "/users/me",
            );

          if (cancelled) {
            return;
          }

          const data =
            response.data;

          if (
            data.success ===
              true &&
            data.user
          ) {
            const user =
              data.user as CurrentUser;

            setCurrentUser(
              user,
            );

            localStorage.setItem(
              "user",
              JSON.stringify(
                user,
              ),
            );
          }

          const codes =
            Array.isArray(
              data.permissions,
            )
              ? (
                  data.permissions as unknown[]
                ).filter(
                  (
                    value,
                  ): value is string =>
                    typeof value ===
                    "string",
                )
              : [];

          setPermissions(
            codes,
          );
        } catch (error) {
          console.error(
            "Load current user:",
            error,
          );

          setPermissions([]);
        }
      };

    void loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleProfileUpdated = (
      event: Event,
    ) => {
      const customEvent =
        event as CustomEvent<CurrentUser>;

      if (
        !customEvent.detail
      ) {
        return;
      }

      setCurrentUser(
        customEvent.detail,
      );

      localStorage.setItem(
        "user",
        JSON.stringify(
          customEvent.detail,
        ),
      );
    };

    window.addEventListener(
      "profile-updated",
      handleProfileUpdated,
    );

    return () => {
      window.removeEventListener(
        "profile-updated",
        handleProfileUpdated,
      );
    };
  }, []);

  const handleMenuClick:
    MenuProps["onClick"] = ({
      key,
    }) => {
      navigate(key);
    };

  const handleProfile = () => {
    navigate("/profile");
  };

  const handleLogout =
    async () => {
      try {
        await api.post(
          "/users/logout",
        );
      } catch (error) {
        console.error(
          "Logout API:",
          error,
        );
      } finally {
        localStorage.removeItem(
          "access_token",
        );
        localStorage.removeItem(
          "user",
        );

        setCurrentUser(null);
        setPermissions([]);

        navigate("/login", {
          replace: true,
        });
      }
    };

  const displayName =
    currentUser?.full_name?.trim() ||
    "Người dùng";

  const displayEmail =
    currentUser?.email?.trim() ||
    "VASD Pharmacy";

  const displayPosition =
    currentUser?.position
      ?.position_name || "";

  return (
    <Layout
      style={{
        minHeight: "100vh",
      }}
    >
      <Sider
        width={250}
        theme="dark"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          overflow: "auto",
        }}
      >
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <MedicineBoxOutlined />
          </div>

          <div>
            <div className="sidebar-brand-title">
              VASD
            </div>

            <div className="sidebar-brand-subtitle">
              Pharmacy
            </div>
          </div>
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[
            location.pathname,
          ]}
          items={menuItems}
          onClick={
            handleMenuClick
          }
          style={{
            borderInlineEnd: 0,
          }}
        />

        <div className="sidebar-user">
          <Space
            size={10}
            align="center"
          >
            <Avatar
              icon={
                <UserOutlined />
              }
            />

            <div
              style={{
                minWidth: 0,
              }}
            >
              <div
                className="sidebar-user-name"
                style={{
                  maxWidth: 160,
                  overflow:
                    "hidden",
                  textOverflow:
                    "ellipsis",
                  whiteSpace:
                    "nowrap",
                }}
              >
                {displayName}
              </div>

              <Text
                title={displayEmail}
                style={{
                  display: "block",
                  maxWidth: 160,
                  color: "#94a3b8",
                  fontSize: 12,
                  overflow:
                    "hidden",
                  textOverflow:
                    "ellipsis",
                  whiteSpace:
                    "nowrap",
                }}
              >
                {displayEmail}
              </Text>

              {displayPosition && (
                <Text
                  style={{
                    display:
                      "block",
                    color:
                      "#60a5fa",
                    fontSize: 12,
                  }}
                >
                  {
                    displayPosition
                  }
                </Text>
              )}
            </div>
          </Space>

          <Button
            type="text"
            icon={
              <UserOutlined />
            }
            block
            onClick={
              handleProfile
            }
            style={{
              marginTop: 14,
              color:
                location.pathname ===
                "/profile"
                  ? "#69b1ff"
                  : "#ffffff",
              textAlign: "left",
            }}
          >
            Tài khoản của tôi
          </Button>

          <Button
            type="text"
            danger
            icon={
              <LogoutOutlined />
            }
            block
            style={{
              marginTop: 4,
              textAlign: "left",
            }}
            onClick={() =>
              void handleLogout()
            }
          >
            Đăng xuất
          </Button>
        </div>
      </Sider>

      <Layout
        style={{
          marginLeft: 250,
          background:
            "#f5f7fa",
        }}
      >
        <Header className="main-header">
          <div>
            <Title
              level={4}
              style={{
                margin: 0,
              }}
            >
              VASD Pharmacy
            </Title>

            <Text type="secondary">
              Hệ thống quản lý
              kho thuốc
            </Text>
          </div>

          <Space>
            <ShopOutlined />
            <Text>
              Nhà thuốc VASD
            </Text>
          </Space>
        </Header>

        <Content
          style={{
            padding: 24,
            minHeight:
              "calc(100vh - 72px)",
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

export default MainLayout;
