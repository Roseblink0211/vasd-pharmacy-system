import { useEffect, useState } from "react";

import axios from "axios";

import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Form,
  Input,
  message,
  Row,
  Space,
  Tag,
  Typography,
} from "antd";

import {
  KeyOutlined,
  MailOutlined,
  ReloadOutlined,
  SaveOutlined,
  UserOutlined,
} from "@ant-design/icons";

import api from "../api/api";

const { Title, Text } = Typography;

/* =========================
   TYPES
========================= */

interface UserProfile {
  id: number;

  full_name: string;

  email: string;

  phone?: string | null;

  address?: string | null;

  is_active?: boolean;
}

interface UpdateProfileValues {
  full_name: string;

  email: string;

  phone?: string;

  address?: string;
}

interface ChangePasswordValues {
  old_password: string;

  new_password: string;

  confirm_password: string;
}

/* =========================
   HELPERS
========================= */

function getApiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;

    if (typeof data === "object" && data !== null) {
      const responseData = data as {
        detail?: string;
        message?: string;
      };

      return responseData.detail || responseData.message || fallback;
    }
  }

  return fallback;
}

function validateNewPassword(password: string) {
  if (password.length < 8) {
    return false;
  }

  if (/\s/.test(password)) {
    return false;
  }

  if (!/[A-Za-z]/.test(password)) {
    return false;
  }

  if (!/[0-9]/.test(password)) {
    return false;
  }

  if (!/[^A-Za-z0-9\s]/.test(password)) {
    return false;
  }

  return true;
}

/* =========================
   COMPONENT
========================= */

function Profile() {
  const [profileForm] = Form.useForm<UpdateProfileValues>();

  const [passwordForm] = Form.useForm<ChangePasswordValues>();

  const [user, setUser] = useState<UserProfile | null>(null);

  const [loading, setLoading] = useState(true);

  const [updating, setUpdating] = useState(false);

  const [changingPassword, setChangingPassword] = useState(false);

  /* =========================
     INITIAL PROFILE
  ========================= */

  useEffect(() => {
    let cancelled = false;

    const loadInitialProfile = async () => {
      try {
        const response = await api.get("/users/me");

        if (cancelled) {
          return;
        }

        const data = response.data;

        if (data.success !== true || !data.user) {
          message.error(data.message || "Không thể tải thông tin người dùng");

          return;
        }

        const profile = data.user as UserProfile;

        setUser(profile);

        profileForm.setFieldsValue({
          full_name: profile.full_name || "",

          email: profile.email || "",

          phone: profile.phone || "",

          address: profile.address || "",
        });
      } catch (error) {
        console.error("Load profile:", error);

        if (!cancelled) {
          message.error(
            getApiErrorMessage(error, "Không thể tải thông tin tài khoản"),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadInitialProfile();

    return () => {
      cancelled = true;
    };
  }, [profileForm]);

  /* =========================
     RELOAD PROFILE
  ========================= */

  const handleReload = async () => {
    try {
      setLoading(true);

      const response = await api.get("/users/me");

      const data = response.data;

      if (data.success !== true || !data.user) {
        message.error(data.message || "Không thể tải thông tin người dùng");

        return;
      }

      const profile = data.user as UserProfile;

      setUser(profile);

      profileForm.setFieldsValue({
        full_name: profile.full_name || "",

        email: profile.email || "",

        phone: profile.phone || "",

        address: profile.address || "",
      });

      message.success("Đã cập nhật thông tin tài khoản");
    } catch (error) {
      console.error("Reload profile:", error);

      message.error(
        getApiErrorMessage(error, "Không thể tải lại thông tin tài khoản"),
      );
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     UPDATE PROFILE
  ========================= */

  const handleUpdateProfile = async (values: UpdateProfileValues) => {
    const fullName = values.full_name.trim();

    const email = values.email.trim();

    if (!fullName) {
      message.warning("Họ và tên không được để trống");

      return;
    }

    if (!email) {
      message.warning("Email không được để trống");

      return;
    }

    try {
      setUpdating(true);

      const response = await api.put("/users/profile", {
        full_name: fullName,

        email,

        phone: values.phone?.trim() || null,

        address: values.address?.trim() || null,
      });

      const data = response.data;

      if (data.success !== true) {
        message.error(data.message || "Cập nhật hồ sơ thất bại");

        return;
      }

      /*
       * Backend update chỉ trả user_id.
       * Vì vậy GET /users/me lần nữa
       * để lấy dữ liệu mới nhất.
       */

      const profileResponse = await api.get("/users/me");

      const profileData = profileResponse.data;

      if (profileData.success === true && profileData.user) {
        const updatedUser = profileData.user as UserProfile;

        setUser(updatedUser);

        profileForm.setFieldsValue({
          full_name: updatedUser.full_name || "",

          email: updatedUser.email || "",

          phone: updatedUser.phone || "",

          address: updatedUser.address || "",
        });

        /*
         * Lưu thêm để các phần frontend
         * khác có thể sử dụng.
         */

        localStorage.setItem("user", JSON.stringify(updatedUser));

        window.dispatchEvent(
          new CustomEvent("profile-updated", {
            detail: updatedUser,
          }),
        );
      }

      message.success(data.message || "Cập nhật thông tin thành công");
    } catch (error) {
      console.error("Update profile:", error);

      message.error(getApiErrorMessage(error, "Có lỗi khi cập nhật thông tin"));
    } finally {
      setUpdating(false);
    }
  };

  /* =========================
     CHANGE PASSWORD
  ========================= */

  const handleChangePassword = async (values: ChangePasswordValues) => {
    const oldPassword = values.old_password;

    const newPassword = values.new_password;

    const confirmPassword = values.confirm_password;

    if (newPassword !== confirmPassword) {
      message.warning("Xác nhận mật khẩu mới không khớp");

      return;
    }

    if (!validateNewPassword(newPassword)) {
      message.warning(
        "Mật khẩu mới phải có ít nhất 8 ký tự, gồm chữ, số, ký tự đặc biệt và không chứa khoảng trắng",
      );

      return;
    }

    if (oldPassword === newPassword) {
      message.warning("Mật khẩu mới phải khác mật khẩu hiện tại");

      return;
    }

    try {
      setChangingPassword(true);

      const response = await api.put("/users/change-password", {
        old_password: oldPassword,

        new_password: newPassword,
      });

      const data = response.data;

      if (data.success !== true) {
        message.error(data.message || "Đổi mật khẩu thất bại");

        return;
      }

      passwordForm.resetFields();

      message.success(data.message || "Đổi mật khẩu thành công");
    } catch (error) {
      console.error("Change password:", error);

      message.error(getApiErrorMessage(error, "Có lỗi khi đổi mật khẩu"));
    } finally {
      setChangingPassword(false);
    }
  };

  /* =========================
     LOADING
  ========================= */

  if (loading && !user) {
    return (
      <Card loading>
        <div
          style={{
            minHeight: 300,
          }}
        />
      </Card>
    );
  }

  /* =========================
     UI
  ========================= */

  return (
    <div>
      {/* HEADER */}

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
            Tài khoản của tôi
          </Title>

          <Text type="secondary">
            Xem và cập nhật thông tin tài khoản đang đăng nhập
          </Text>
        </div>

        <Button
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => void handleReload()}
        >
          Làm mới
        </Button>
      </div>

      {/* USER SUMMARY */}

      <Card
        style={{
          marginBottom: 16,
        }}
      >
        <Row gutter={[24, 24]} align="middle">
          <Col>
            <Avatar
              size={72}
              icon={<UserOutlined />}
              style={{
                background: "#1677ff",
              }}
            />
          </Col>

          <Col flex="auto">
            <Title
              level={4}
              style={{
                marginBottom: 4,
              }}
            >
              {user?.full_name || "Người dùng"}
            </Title>

            <Space wrap>
              <Text type="secondary">
                <MailOutlined /> {user?.email || "-"}
              </Text>

              {user?.is_active !== undefined && (
                <Tag color={user.is_active ? "green" : "red"}>
                  {user.is_active ? "Đang hoạt động" : "Đã khóa"}
                </Tag>
              )}
            </Space>
          </Col>
        </Row>

        <Divider />

        <Descriptions
          column={{
            xs: 1,
            sm: 1,
            md: 2,
            lg: 2,
          }}
        >
          <Descriptions.Item label="Mã người dùng">
            {user?.id ?? "-"}
          </Descriptions.Item>

          <Descriptions.Item label="Email">
            {user?.email || "-"}
          </Descriptions.Item>

          <Descriptions.Item label="Số điện thoại">
            {user?.phone || "Chưa cập nhật"}
          </Descriptions.Item>

          <Descriptions.Item label="Địa chỉ">
            {user?.address || "Chưa cập nhật"}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={[16, 16]}>
        {/* =====================
            PROFILE
        ====================== */}

        <Col xs={24} xl={14}>
          <Card
            title={
              <Space>
                <UserOutlined />

                <span>Thông tin cá nhân</span>
              </Space>
            }
          >
            <Form
              form={profileForm}
              layout="vertical"
              requiredMark={false}
              onFinish={handleUpdateProfile}
            >
              <Form.Item
                label="Họ và tên"
                name="full_name"
                rules={[
                  {
                    required: true,

                    message: "Vui lòng nhập họ và tên",
                  },

                  {
                    whitespace: true,

                    message: "Họ và tên không được để trống",
                  },
                ]}
              >
                <Input prefix={<UserOutlined />} placeholder="Nhập họ và tên" />
              </Form.Item>

              <Form.Item
                label="Email"
                name="email"
                rules={[
                  {
                    required: true,

                    message: "Vui lòng nhập email",
                  },

                  {
                    type: "email",

                    message: "Email không hợp lệ",
                  },
                ]}
              >
                <Input
                  prefix={<MailOutlined />}
                  placeholder="example@gmail.com"
                />
              </Form.Item>

              <Form.Item label="Số điện thoại" name="phone">
                <Input maxLength={20} placeholder="Nhập số điện thoại" />
              </Form.Item>

              <Form.Item label="Địa chỉ" name="address">
                <Input.TextArea
                  rows={4}
                  maxLength={500}
                  showCount
                  placeholder="Nhập địa chỉ"
                />
              </Form.Item>

              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={updating}
              >
                Cập nhật thông tin
              </Button>
            </Form>
          </Card>
        </Col>

        {/* =====================
            PASSWORD
        ====================== */}

        <Col xs={24} xl={10}>
          <Card
            title={
              <Space>
                <KeyOutlined />

                <span>Đổi mật khẩu</span>
              </Space>
            }
          >
            <Alert
              showIcon
              type="info"
              style={{
                marginBottom: 20,
              }}
              message="Yêu cầu mật khẩu"
              description="Ít nhất 8 ký tự, có chữ, số, ký tự đặc biệt và không chứa khoảng trắng."
            />

            <Form
              form={passwordForm}
              layout="vertical"
              requiredMark={false}
              onFinish={handleChangePassword}
            >
              <Form.Item
                label="Mật khẩu hiện tại"
                name="old_password"
                rules={[
                  {
                    required: true,

                    message: "Vui lòng nhập mật khẩu hiện tại",
                  },
                ]}
              >
                <Input.Password
                  prefix={<KeyOutlined />}
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu hiện tại"
                />
              </Form.Item>

              <Form.Item
                label="Mật khẩu mới"
                name="new_password"
                rules={[
                  {
                    required: true,

                    message: "Vui lòng nhập mật khẩu mới",
                  },

                  {
                    validator: (_, value) => {
                      if (!value) {
                        return Promise.resolve();
                      }

                      if (!validateNewPassword(value)) {
                        return Promise.reject(
                          new Error(
                            "Ít nhất 8 ký tự, có chữ, số, ký tự đặc biệt và không có khoảng trắng",
                          ),
                        );
                      }

                      return Promise.resolve();
                    },
                  },
                ]}
              >
                <Input.Password
                  prefix={<KeyOutlined />}
                  autoComplete="new-password"
                  placeholder="Nhập mật khẩu mới"
                />
              </Form.Item>

              <Form.Item
                label="Xác nhận mật khẩu mới"
                name="confirm_password"
                dependencies={["new_password"]}
                rules={[
                  {
                    required: true,

                    message: "Vui lòng xác nhận mật khẩu mới",
                  },

                  ({ getFieldValue }) => ({
                    validator: (_, value) => {
                      if (!value || getFieldValue("new_password") === value) {
                        return Promise.resolve();
                      }

                      return Promise.reject(
                        new Error("Xác nhận mật khẩu không khớp"),
                      );
                    },
                  }),
                ]}
              >
                <Input.Password
                  prefix={<KeyOutlined />}
                  autoComplete="new-password"
                  placeholder="Nhập lại mật khẩu mới"
                />
              </Form.Item>

              <Button
                type="primary"
                htmlType="submit"
                icon={<KeyOutlined />}
                loading={changingPassword}
              >
                Đổi mật khẩu
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default Profile;
