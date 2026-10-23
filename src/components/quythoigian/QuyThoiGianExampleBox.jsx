import React from 'react';

export default function QuyThoiGianExampleBox() {
  return (
    <div className="bg-white rounded-[14px] border border-gray-200 p-5 shadow-none">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h2 className="hue-h2 text-[17px]">
            Ví dụ: một bưu gửi được đo thế nào
          </h2>
          <span className="text-xs font-semibold text-gray-500 italic">
            (ví dụ minh họa)
          </span>
        </div>
        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
          Bưu gửi đến Trung tâm khai thác lúc 15:25 ngày 20/10 và đến BCVH lúc 07:45 ngày 21/10. Giờ ban đêm (21:00–07:00) không được tính nên đã qua 6 giờ 20 phút (thông qua mốc thời gian 14 giờ).
        </p>
      </div>

      {/* Sơ đồ thời gian trực quan */}
      <div className="my-5 p-4 rounded-[14px] bg-cream-light/50 border border-cream-line">
        {/* Nhãn hai mốc thời gian */}
        <div className="flex items-center justify-between text-xs text-gray-900 font-medium mb-1.5 px-1">
          <div>
            <div className="font-bold text-[#4A1D6E]">20/10 · 15:25</div>
            <div className="text-xs text-gray-500">Đến Trung tâm khai thác</div>
          </div>
          <div className="text-right">
            <div className="font-bold text-[#4A1D6E]">21/10 · 07:45</div>
            <div className="text-xs text-gray-500">BCVH nhận</div>
          </div>
        </div>

        {/* Thanh tiến trình phân đoạn thời gian */}
        <div className="flex h-9 rounded-[10px] overflow-hidden border border-[#D9CBA8] shadow-2xs text-xs font-semibold select-none">
          {/* Đoạn 1: Chiều 15:25 - 21:00 (5 g 35 p) */}
          <div
            className="flex items-center justify-center text-white bg-[#4A1D6E] px-2 text-center"
            style={{ width: '42%' }}
            title="15:25 đến 21:00: 5 giờ 35 phút (được tính)"
          >
            <span className="truncate">5 g 35 p · tính giờ</span>
          </div>

          {/* Đoạn 2: Đêm 21:00 - 07:00 (10 giờ không tính) */}
          <div
            className="flex items-center justify-center text-gray-700 px-2 text-center border-x border-[#D8BDEB]"
            style={{
              width: '46%',
              backgroundColor: '#F5EEFA',
              backgroundImage: 'repeating-linear-gradient(45deg, #EBDDF5, #EBDDF5 10px, #F5EEFA 10px, #F5EEFA 20px)'
            }}
            title="Khung ban đêm 21:00 đến 07:00: Không tính vào thời gian đã qua"
          >
            <span className="truncate">Ban đêm 21:00–07:00 · không tính</span>
          </div>

          {/* Đoạn 3: Sáng 07:00 - 07:45 (45 phút) */}
          <div
            className="flex items-center justify-center text-white bg-[#4A1D6E] px-1 text-center"
            style={{ width: '12%' }}
            title="07:00 đến 07:45: 45 phút (được tính)"
          >
            <span>45 p</span>
          </div>
        </div>
      </div>

      {/* 3 ô tóm tắt kết quả tính toán */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Ô 1: Đã qua */}
        <div className="p-4 rounded-[14px] border border-gray-200 bg-white">
          <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">
            Đã qua
          </div>
          <div className="text-2xl font-bold font-serif text-[#4A1D6E] mt-1">
            6 giờ 20 phút
          </div>
          <div className="text-xs text-gray-500 mt-1">
            5 g 35 p + 45 p
          </div>
        </div>

        {/* Ô 2: Chỉ tiêu */}
        <div className="p-4 rounded-[14px] border border-gray-200 bg-white">
          <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">
            Chỉ tiêu
          </div>
          <div className="text-2xl font-bold font-serif text-gray-900 mt-1">
            14 giờ
          </div>
          <div className="text-xs text-gray-500 mt-1">
            F1.3
          </div>
        </div>

        {/* Ô 3: Còn lại */}
        <div className="p-4 rounded-[14px] border border-[#B7E0CE] bg-[#EAF6F1]">
          <div className="text-[11px] font-bold text-[#1F7A5C] uppercase tracking-wider">
            Còn lại (khi BCVH nhận)
          </div>
          <div className="text-2xl font-bold font-serif text-[#1F7A5C] mt-1">
            7 giờ 40 phút
          </div>
          <div className="text-xs text-[#1F7A5C] mt-1">
            Chưa đến giờ phát = Còn thời gian
          </div>
        </div>
      </div>

      {/* Chú thích ngoại lệ 12 giờ */}
      <div className="mt-3 text-xs text-gray-500 italic">
        * Riêng bưu gửi thuộc địa bàn phường Thuận Hóa và Phú Xuân thuộc BCVH Thuận Hóa có chỉ tiêu 12 giờ, thời gian còn lại sẽ là 5 giờ 40 phút.
      </div>
    </div>
  );
}
