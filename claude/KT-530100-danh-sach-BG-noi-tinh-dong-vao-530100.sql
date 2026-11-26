-- ============================================================================
-- DANH SÁCH BƯU GỬI NỘI TỈNH ĐÓNG CHUYẾN THƯ VÀO 530100 (trên DB 530100)
-- Chỉ lấy nơi đóng có mã bắt đầu bằng 53.
--   KẾT QUẢ 1: một dòng = một bưu gửi.
--   KẾT QUẢ 2: một dòng = một túi (tổng hợp theo nơi đóng, ngày đóng CT, số CT, số hiệu túi).
--
-- CHỈ ĐỌC (chỉ tạo bảng tạm #... trong tempdb). Kết quả 1 có số hiệu bưu gửi: chỉ xem trên máy, không dán vào chat hay tài liệu.
--
-- CÁCH HIỂU (giống module «Hướng đóng chuyến nội tỉnh»):
--   - «Đóng vào 530100» = Dispatch.ToPOSCode = 530100, nơi đóng = Dispatch.FromPOSCode.
--   - «Nội tỉnh» = bưu gửi mà 530100 sau đó đóng đi một trong 6 BCVH Huế (BCVH dự kiến phát = BCVH đó).
--   - Mặc định chỉ lấy nhóm N2 (chỉ có túi vào 530100, không có chuyển tiếp thẳng BCVH). N3 (có cả hai kiểu) bật bằng @GomN3.
--   - Mặc định bỏ 6 BCVH khỏi cột «BC đóng» như module (mã 6 BCVH cũng bắt đầu bằng 53); đặt @BoQua6BCVH = 0 để hiện.
--   - Tên BC đóng lấy từ bảng POS (cột POSCode, POSName). Nếu báo lỗi tên cột, chạy dòng dưới để xem tên cột thật rồi sửa 2 chỗ:
--       SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'POS';
--
-- ĐIỀU CHƯA CHẮC:
--   1. Ngày lọc theo ngày đóng chuyến thư (Mailtrip.OutgoingDate); màn hình module tính theo ngày hàng đến,
--      nên số một ngày có thể lệch so với màn.
--   2. Không loại được hàng hoàn (chưa biết cột). PO xem tay nếu thấy dòng lạ.
--   3. Bưu gửi vào 530100 mà 530100 chưa đóng đi BCVH trong @SoNgayCho ngày thì không có trong danh sách.
-- ============================================================================
SET NOCOUNT ON;

-- ---------------------------------------------------------------- THAM SỐ
DECLARE @POS530100    VARCHAR(20) = '530100';
DECLARE @TuNgay       DATE        = '2026-11-03';   -- ngày đóng chuyến thư, gồm cả ngày này
DECLARE @DenNgay      DATE        = '2026-11-03';   -- gồm cả ngày này
DECLARE @SoNgayCho    INT         = 3;              -- tìm chặng 530100 đóng đi BCVH muộn hơn @DenNgay tối đa N ngày
DECLARE @GomN3        BIT         = 0;              -- 1: lấy cả bưu gửi có cả túi vào 530100 và chuyển tiếp thẳng BCVH
DECLARE @BoQua6BCVH   BIT         = 1;              -- 1: không hiện 6 BCVH ở cột BC đóng (như module)

-- ---------------------------------------------------------------- AN TOÀN: đúng DB 530100
DECLARE @ConfigPOSCode VARCHAR(20) = (SELECT ConfigValue FROM Configuration WHERE ConfigCode = 'POSCode');
IF ISNULL(@ConfigPOSCode, '') <> @POS530100
BEGIN
    RAISERROR(N'Đây không phải DB của 530100 (POSCode đang là %s). Dừng, không chạy tiếp.', 16, 1, @ConfigPOSCode);
    RETURN;
END

DECLARE @BCVH TABLE (Ma VARCHAR(20) PRIMARY KEY);
INSERT INTO @BCVH (Ma) VALUES ('533140'),('535470'),('535790'),('536250'),('537015'),('537220');

DECLARE @TuGio     DATETIME = CAST(@TuNgay AS DATETIME);
DECLARE @DenGioNoi DATETIME = DATEADD(DAY, 1, CAST(@DenNgay AS DATETIME));
DECLARE @OutGioNoi DATETIME = DATEADD(DAY, 1 + @SoNgayCho, CAST(@DenNgay AS DATETIME));

IF OBJECT_ID('tempdb..#Dong') IS NOT NULL DROP TABLE #Dong;
IF OBJECT_ID('tempdb..#Out')  IS NOT NULL DROP TABLE #Out;
IF OBJECT_ID('tempdb..#BI')   IS NOT NULL DROP TABLE #BI;

-- (A) Dòng bưu gửi-chuyến thư do nơi khác 530100 đóng trong khoảng ngày, đích là 530100 hoặc một BCVH
SELECT D.ItemCode, D.FromPOSCode, D.ToPOSCode, D.MailTripType, D.ServiceCode, D.[Year],
       D.MailTripNumber, D.PostBagIndex, M.OutgoingDate,
       CASE WHEN D.ToPOSCode = @POS530100 THEN 'DEN' ELSE 'CHUYEN_TIEP' END AS Loai
INTO #Dong
FROM Dispatch D
INNER JOIN Mailtrip M
        ON M.StartingCode    = D.FromPOSCode
       AND M.DestinationCode = D.ToPOSCode
       AND M.MailtripType    = D.MailTripType
       AND M.ServiceCode     = D.ServiceCode
       AND M.[Year]          = D.[Year]
       AND M.MailTripNumber  = D.MailTripNumber
WHERE D.FromPOSCode <> @POS530100
  AND D.FromPOSCode LIKE '53%'
  AND (D.ToPOSCode = @POS530100 OR D.ToPOSCode IN (SELECT Ma FROM @BCVH))
  AND M.OutgoingDate >= @TuGio
  AND M.OutgoingDate <  @DenGioNoi;

CREATE INDEX IX_Dong_Item ON #Dong (ItemCode);

-- (B) Chặng 530100 đóng đi 6 BCVH của các bưu gửi trên: BCVH dự kiến phát
SELECT D.ItemCode, MIN(D.ToPOSCode) AS BCVH_dich
INTO #Out
FROM Dispatch D
INNER JOIN Mailtrip M
        ON M.StartingCode    = D.FromPOSCode
       AND M.DestinationCode = D.ToPOSCode
       AND M.MailtripType    = D.MailTripType
       AND M.ServiceCode     = D.ServiceCode
       AND M.[Year]          = D.[Year]
       AND M.MailTripNumber  = D.MailTripNumber
WHERE D.FromPOSCode = @POS530100
  AND D.ToPOSCode IN (SELECT Ma FROM @BCVH)
  AND M.OutgoingDate >= @TuGio
  AND M.OutgoingDate <  @OutGioNoi
  AND EXISTS (SELECT 1 FROM #Dong x WHERE x.ItemCode = D.ItemCode)
GROUP BY D.ItemCode;

CREATE INDEX IX_Out_Item ON #Out (ItemCode);

-- (C) Cặp bưu gửi-túi vào 530100 của hàng nội tỉnh; LaN2 = 1 nếu bưu gửi không có chuyển tiếp thẳng BCVH (nhóm N2)
SELECT DISTINCT x.FromPOSCode, x.ToPOSCode, x.MailTripType, x.ServiceCode, x.[Year], x.MailTripNumber, x.PostBagIndex,
       CAST(x.OutgoingDate AS DATE) AS NgayDong, x.ItemCode, o.BCVH_dich,
       CASE WHEN ct.ItemCode IS NULL THEN 1 ELSE 0 END AS LaN2
INTO #BI
FROM #Dong x
INNER JOIN #Out o ON o.ItemCode = x.ItemCode            -- chỉ bưu gửi có chặng 530100 đóng đi BCVH = nội tỉnh
LEFT JOIN (SELECT DISTINCT ItemCode FROM #Dong WHERE Loai = 'CHUYEN_TIEP') ct ON ct.ItemCode = x.ItemCode
WHERE x.Loai = 'DEN'
  AND (@BoQua6BCVH = 0 OR x.FromPOSCode NOT IN (SELECT Ma FROM @BCVH));

-- ============================================================================
-- KẾT QUẢ 1: một dòng = một bưu gửi nội tỉnh đóng chuyến thư vào 530100
-- ============================================================================
SELECT b.FromPOSCode                                                      AS [BC đóng],
       (SELECT TOP 1 P.POSName FROM POS P WHERE P.POSCode = b.FromPOSCode) AS [Tên BC đóng],
       b.ToPOSCode                                                        AS [BC nhận],
       b.MailTripNumber                                                   AS [Số CT],
       b.NgayDong                                                         AS [Ngày đóng CT],
       PB.PostBagCode                                                     AS [Số hiệu túi],
       b.ItemCode                                                         AS [Số hiệu BG],
       b.BCVH_dich                                                        AS [BCVH dự kiến phát]
FROM #BI b
LEFT JOIN PostBag PB
       ON PB.PostBagIndex   = b.PostBagIndex
      AND PB.FromPOSCode    = b.FromPOSCode
      AND PB.ToPOSCode      = b.ToPOSCode
      AND PB.[Year]         = b.[Year]
      AND PB.MailTripNumber = b.MailTripNumber
      AND PB.MailTripType   = b.MailTripType
      AND PB.ServiceCode    = b.ServiceCode
WHERE @GomN3 = 1 OR b.LaN2 = 1
ORDER BY b.FromPOSCode, b.NgayDong, b.MailTripNumber, PB.PostBagCode, b.ItemCode;

-- ============================================================================
-- KẾT QUẢ 2 (tổng hợp): một dòng = một túi vào 530100
--   «Số BG nội tỉnh trong túi» tính cả N2 và N3 (đúng cách module tính cỡ túi), không phụ thuộc @GomN3.
--   Túi không có BG N2 nào chỉ hiện khi @GomN3 = 1.
-- ============================================================================
SELECT b.FromPOSCode                                                      AS [BC đóng],
       (SELECT TOP 1 P.POSName FROM POS P WHERE P.POSCode = b.FromPOSCode) AS [Tên BC đóng],
       b.NgayDong                                                         AS [Ngày đóng CT],
       b.MailTripNumber                                                   AS [Số CT],
       PB.PostBagCode                                                     AS [Số hiệu túi],
       COUNT(DISTINCT b.ItemCode)                                         AS [Số BG nội tỉnh trong túi],
       COUNT(DISTINCT b.BCVH_dich)                                        AS [Số BCVH đích],
       STUFF((SELECT DISTINCT ', ' + b2.BCVH_dich
                FROM #BI b2
               WHERE b2.FromPOSCode   = b.FromPOSCode
                 AND b2.ToPOSCode     = b.ToPOSCode
                 AND b2.MailTripType  = b.MailTripType
                 AND b2.ServiceCode   = b.ServiceCode
                 AND b2.[Year]        = b.[Year]
                 AND b2.MailTripNumber= b.MailTripNumber
                 AND b2.PostBagIndex  = b.PostBagIndex
              FOR XML PATH('')), 1, 2, '')                                AS [BCVH dự kiến phát]
FROM #BI b
LEFT JOIN PostBag PB
       ON PB.PostBagIndex   = b.PostBagIndex
      AND PB.FromPOSCode    = b.FromPOSCode
      AND PB.ToPOSCode      = b.ToPOSCode
      AND PB.[Year]         = b.[Year]
      AND PB.MailTripNumber = b.MailTripNumber
      AND PB.MailTripType   = b.MailTripType
      AND PB.ServiceCode    = b.ServiceCode
GROUP BY b.FromPOSCode, b.NgayDong, b.MailTripNumber, PB.PostBagCode,
         b.ToPOSCode, b.MailTripType, b.ServiceCode, b.[Year], b.PostBagIndex   -- khóa túi 7 cột (mã túi có thể trùng)
HAVING @GomN3 = 1 OR SUM(b.LaN2) > 0
ORDER BY b.NgayDong, COUNT(DISTINCT b.ItemCode) DESC, b.FromPOSCode, PB.PostBagCode;

DROP TABLE #BI; DROP TABLE #Out; DROP TABLE #Dong;
