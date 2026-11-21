import {
  Typography,
} from "antd";

import WarehouseTransferApproval from "./WarehouseTransferApproval";

const { Title, Text } = Typography;

function ApprovalRequests() {
  return (
    <div>
      <div
        style={{
          marginBottom: 20,
        }}
      >
        <Title
          level={3}
          style={{
            marginBottom: 4,
          }}
        >
          Duyệt yêu cầu
        </Title>

        <Text type="secondary">
          Chỉ xử lý các phiếu Chuyển kho đang chờ duyệt.
          Nhập thuốc được duyệt ngay tại trang Nhập thuốc.
        </Text>
      </div>

      <WarehouseTransferApproval />
    </div>
  );
}

export default ApprovalRequests;
