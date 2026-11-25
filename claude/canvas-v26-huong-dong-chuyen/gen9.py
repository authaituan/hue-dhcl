import json, sys
root = sys.argv[1]
BR="#4A1D6E"; SOFT="#EFE6F5"; LINE="#E4D5AE"; INK="#2B2233"; INK2="#4A3F55"; MUT="#6B5F73"
GOLD="#E0A82E"; GOLDINK="#8A6100"; CREAM="#F6F1E7"; HEAD="#FAF5E8"; GREEN="#1F7A5C"; RED="#B3202A"; LIGHT="#D9C8E6"
def f(n): return f"{n:,}".replace(",", ".")
BODY="font-family:'Be Vietnam Pro',system-ui,sans-serif"
PF="font-family:'Playfair Display',serif"
NUMS="font-variant-numeric:tabular-nums"
DL='<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 7 8 10.5 11.5 7M3 13h10" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
def xbtn(t="Tải Excel"): return f'<span style="display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 12px;border-radius:8px;background:{BR};color:#fff;font-size:12.5px;font-weight:600;white-space:nowrap">{DL}{t}</span>'
def pill(t,on=False):
    st = f"border:1px solid {BR};background:{BR};color:#fff;font-weight:600" if on else f"border:1px solid {LINE};background:#fff;color:{INK};font-weight:500"
    return f'<span style="padding:8px 14px;border-radius:20px;{st};font-size:13px;white-space:nowrap">{t}</span>'
def section(h, desc, body):
    d = f'<div style="font-size:12.5px;color:{MUT};max-width:1000px">{desc}</div>' if desc else ''
    return f'<section style="background:#fff;border:1px solid {LINE};border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:16px"><div style="display:flex;flex-direction:column;gap:2px"><h2 style="margin:0;{PF};font-size:22px;font-weight:700;color:{BR}">{h}</h2>{d}</div>{body}</section>'
def card(title, body):
    return f'<div style="background:#fff;border:1px solid {LINE};border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;min-width:0">{("<div style=\"font-size:15px;font-weight:700;color:"+BR+"\">"+title+"</div>") if title else ""}{body}</div>'
def tile(label, num, sub, col):
    return f'<div style="background:#fff;border:1px solid {LINE};border-top:4px solid {col};border-radius:10px;padding:14px 18px;display:flex;flex-direction:column;gap:4px"><div style="font-size:12.5px;color:{MUT};font-weight:600">{label}</div><div style="{PF};font-size:30px;font-weight:700;line-height:1.1;color:{col}">{num}</div><div style="font-size:12.5px;color:{MUT}">{sub}</div></div>'
def note(kind, title, text, btn=""):
    col,bg,ic = {"LƯU Ý":(GOLDINK,"#FBF0D2",f'<rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="{GOLDINK}" stroke-width="1.6"/><path d="M8 5v4M8 11v.01" stroke="{GOLDINK}" stroke-width="1.6" stroke-linecap="round"/>'),
                 "THÔNG TIN":(BR,SOFT,f'<circle cx="8" cy="8" r="6.5" fill="none" stroke="{BR}" stroke-width="1.6"/><path d="M8 7v4M8 4.8v.01" stroke="{BR}" stroke-width="1.6" stroke-linecap="round"/>')}[kind]
    b = f'<div>{btn}</div>' if btn else ''
    return f'<div style="background:#fff;border:1px solid {LINE};border-left:6px solid {col};border-radius:8px;padding:12px 16px;display:flex;flex-direction:column;gap:8px"><div style="display:flex;gap:8px;align-items:center"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">{ic}</svg><span style="font-size:12.5px;font-weight:700;color:{col};background:{bg};border-radius:6px;padding:2px 8px">{kind} · {title}</span></div><div style="font-size:14.5px">{text}</div>{b}</div>'

BC=[("533140","Thuận Hóa"),("536250","Hương Thủy"),("535470","Hương Trà"),("537015","Thuận An"),("537220","Phú Lộc"),("535790","A Lưới")]
def matrix(d):
    th=f"font-size:12px;color:{MUT};font-weight:700;padding:8px 6px;background:{HEAD};border-bottom:2px solid {LINE};text-align:center;vertical-align:bottom;line-height:1.3"
    td=f"padding:6px;border-bottom:1px solid {LINE};vertical-align:middle"
    h=f'<table style="border-collapse:collapse;width:100%;min-width:760px"><thead><tr><th style="{th};text-align:left">Nơi đóng chuyến thư</th>'
    for ma,ten in BC: h+=f'<th style="{th}">{ten}<br><span style="font-weight:400">{ma}</span></th>'
    h+=f'<th style="{th};text-align:right">Cộng<br><span style="font-weight:400">bưu gửi</span></th><th style="{th};text-align:right">Số túi<br><span style="font-weight:400">túi</span></th></tr></thead><tbody>'
    def cell(v,tot,tui):
        if v==0: return f'<td style="{td};text-align:center;color:{MUT}">·</td>'
        sh=v/tot; a=0.08+0.72*sh; fg="#fff" if a>0.5 else INK
        return f'<td style="{td};padding:3px"><div title="{v} BG, {round(sh*100)}% của nơi này" style="background:rgba(74,29,110,{a:.2f});color:{fg};border-radius:6px;min-height:46px;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.25;{NUMS}"><span style="font-size:14px;font-weight:600">{v} BG</span><span style="font-size:11.5px;opacity:.85">{tui} túi</span></div></td>'
    for r in d["rows"]:
        hv=d["huong"][r["ma"]]; tot=sum(hv); assert tot==r["lon"]
        h+=f'<tr><td style="{td};font-size:13px"><b>{r["ma"]}</b> {r["ten"]}</td>'
        for v in hv: h+=cell(v,tot,r['tui'])
        h+=f'<td style="{td};text-align:right;font-weight:700;font-size:13px;{NUMS}">{f(tot)}</td><td style="{td};text-align:right;font-size:13px;{NUMS}">{r["tui"]}</td></tr>'
    cs=[sum(d["huong"][r["ma"]][i] for r in d["rows"]) for i in range(6)]; assert sum(cs)==d["tot"]["lon"]
    tt=f"font-weight:700;border-top:2px solid {LINE};padding:8px 6px;font-size:13px;{NUMS}"
    h+=f'<tr><td style="{tt}">Cộng {len(d["rows"])} nơi</td>'
    ct=[sum(r["tui"] for r in d["rows"] if d["huong"][r["ma"]][i]>0) for i in range(6)]
    for v,t in zip(cs,ct): h+=f'<td style="{tt};text-align:center;line-height:1.3">{f(v)} BG<br><span style="font-size:11.5px;font-weight:500;color:{MUT}">{t} túi</span></td>'
    return h+f'<td style="{tt};text-align:right">{f(sum(cs))}</td><td style="{tt};text-align:right">{sum(r["tui"] for r in d["rows"])}</td></tr></tbody></table>'

def page(d):
    T=d["tot"]; others=[r for r in d["rows"] if r["ma"]!="531120"]; big=[r for r in d["rows"] if r["ma"]=="531120"]
    mxo=max([r["lon"] for r in others]+[1])
    td=f"padding:8px;border-bottom:1px solid {LINE};vertical-align:middle;font-size:13px"
    th=f"font-size:12px;color:{MUT};text-align:left;padding:8px;background:{HEAD};border-bottom:2px solid {LINE};font-weight:700;vertical-align:bottom"
    tag=lambda t:f'<span style="display:inline-block;font-size:11px;font-weight:700;border-radius:4px;padding:0 6px;background:{SOFT};color:{BR};margin-left:6px;white-space:nowrap">{t}</span>'
    def row(r,bar):
        return f'<tr><td style="{td}"><b>{r["ma"]}</b> {r["ten"]}{tag(r["lh"])}</td><td style="{td}">{bar}</td><td style="{td};text-align:right;{NUMS}">{r["nho"]}</td><td style="{td};text-align:right;{NUMS}">{r["tui"]}</td><td style="{td};text-align:right;{NUMS}">{r["max"]}</td></tr>'
    rows=""
    for r in big: rows+=row(r,f'<b style="{NUMS};color:{GOLDINK}">{f(r["lon"])}</b> <span style="color:{MUT};font-size:12.5px">({d["pct531"]}% sản lượng)</span>')
    for r in others:
        w=r["lon"]/mxo*100
        rows+=row(r,f'<div style="display:flex;align-items:center;gap:8px;min-width:170px"><div style="flex:1;height:16px;border-radius:4px;background:{CREAM};min-width:60px"><div style="width:{w:.1f}%;height:16px;border-radius:4px;background:{BR}"></div></div><b style="white-space:nowrap;{NUMS}">{r["lon"]}</b></div>')
    nr=len(d["rows"]); s=d["small"]; tt=f"font-weight:700;border-top:2px solid {LINE};border-bottom:0"; c=f"padding:8px;vertical-align:middle;font-size:13px;{NUMS}"
    rows+=f'<tr><td style="{c};{tt}">Cộng {nr} nơi có túi từ 15 BG trở lên</td><td style="{c};{tt}">{f(T["lon"])}</td><td style="{c};{tt};text-align:right">{d["nho_lon_noi"]}</td><td style="{c};{tt};text-align:right">{T["tui"]}</td><td style="{c};{tt}"></td></tr>'
    rows+=f'<tr><td style="{td};color:{MUT}">{s["noi"]} nơi chỉ có túi dưới 15 BG <span>(bấm để mở)</span></td><td style="{td};color:{MUT};{NUMS}">0</td><td style="{td};color:{MUT};text-align:right;{NUMS}">{s["nho"]}</td><td style="{td};color:{MUT};text-align:right">0</td><td style="{td}"></td></tr>'
    rows+=f'<tr><td style="{c};{tt}">Cộng {T["noi"]} nơi có hàng vào 530100</td><td style="{c};{tt}">{f(T["lon"])}</td><td style="{c};{tt};text-align:right">{T["nho"]}</td><td style="{c};{tt};text-align:right">{T["tui"]}</td><td style="{c};{tt}"></td></tr>'
    lhtxt=" · ".join(d["lhtxt"])
    nav_items=[("Tổng quan",0),("Lưu thoát trong ngày",1),("A · Hàng đến",0),("B · Tỷ lệ đi cùng ngày (30 ngày)",1),("B · Lịch xe, đường thư",1),("Đối chiếu BCVH",1),("Hướng đóng chuyến nội tỉnh",2)]
    nav=""
    for t,k in nav_items:
        on=(k==2); stl=f"background:{BR};color:#fff;font-weight:700" if on else f"background:{SOFT};color:{BR};font-weight:500"
        bd=f'<span style="font-size:11px;font-weight:700;background:{GOLD if on else "#fff"};color:{INK};border-radius:4px;padding:0 5px;margin-left:6px">xlsx</span>' if (k>=1 and t not in("Tổng quan",) and k!=0) else ''
        nav+=f'<span style="min-height:40px;display:inline-flex;align-items:center;padding:0 14px;border-radius:8px;{stl};font-size:13.5px;white-space:nowrap">{t}{bd}</span>'
    top="".join(f'<span style="min-height:44px;display:inline-flex;align-items:center;padding:0 12px;color:#fff;font-weight:500">{t}</span>' for t in ["Điều hành hôm nay","Sản lượng đến","Xử lý và tỷ lệ phát","Thời gian Khai thác-Vận chuyển"])
    top+=f'<span style="min-height:44px;display:inline-flex;align-items:center;padding:0 16px;border-radius:8px;background:{GOLD};color:{INK};font-weight:700">Hàng tại KTT</span><span style="min-height:44px;display:inline-flex;align-items:center;padding:0 12px;color:#fff;font-weight:500">Quản trị ▾</span>'
    filt=f'''<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
<div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;color:{MUT};font-weight:600">Khoảng ngày</span><span style="min-height:40px;display:inline-flex;align-items:center;gap:10px;padding:0 14px;border:1px solid {LINE};border-radius:8px;background:#fff;font-weight:500;font-size:13.5px"><span style="color:{MUT}">Từ ngày</span> {d["ngay"]} <span style="color:{MUT}">Đến ngày</span> {d["ngay"]}</span></div>
<div style="display:flex;gap:6px;padding-bottom:2px">{pill("30 ngày")}{pill("7 ngày")}</div>
<div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;color:{MUT};font-weight:600">Loại hình nơi đóng</span><div style="display:flex;gap:6px;padding-bottom:2px">{pill("Tất cả",True)}{pill("GD1")}{pill("GD2/GD3")}{pill("VHX")}{pill("531120")}</div></div>
<div style="display:flex;flex-direction:column;gap:2px;margin-left:auto"><span style="font-size:12px;color:{MUT};font-weight:600">Tải xuống</span>{xbtn()}</div></div>'''
    A=section("Hàng nội tỉnh (túi) đóng đến 530100 không đóng thẳng BCVH",
      "Dữ liệu đang tính đối với túi >=15 BG",
      f'''<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">{tile("Sản lượng",f(T["lon"]),f'bưu gửi trong {T["tui"]} túi · {d["rk"]}',GOLDINK)}{tile("Số BC/VHX đóng",str(d["noi_lon"]),"nơi có túi từ 15 BG trở lên",BR)}</div>
{card("",f'<div style="font-size:12.5px;color:{GOLDINK};background:#FBF0D2;border:1px solid {GOLD};border-radius:8px;padding:6px 10px">Số bưu gửi và số túi chia theo BCVH là số minh hoạ để xem bố cục; tổng bưu gửi mỗi dòng, tổng cuối và số túi mỗi nơi bằng số thật của ngày. Số thật theo BCVH sẽ lấy từ danh sách bưu gửi khi làm.</div><div style="overflow-x:auto">{matrix(d)}</div>')}''')
    B=section("Chi tiết từng nơi đóng","",
      f'''<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;min-width:760px"><thead><tr><th style="{th}">Nơi đóng chuyến thư</th><th style="{th}">Hàng trong túi từ 15 BG trở lên</th><th style="{th};text-align:right">Hàng trong túi dưới 15 BG</th><th style="{th};text-align:right">Số túi từ 15 BG trở lên</th><th style="{th};text-align:right">Túi nhiều nhất (bưu gửi)</th></tr></thead><tbody>{rows}</tbody></table></div>

<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;border:1px dashed {LINE};border-radius:8px;padding:10px 12px"><div style="font-size:14px"><b>Danh sách bưu gửi của nơi đóng</b> <span style="color:{MUT}">· bấm một dòng ở bảng trên để mở: số hiệu, ngày hàng đến, ngày đóng chuyến thư, số bưu gửi trong túi, mã túi, BCVH đích, dịch vụ, khối lượng; hộp chọn «Chỉ túi từ 15 BG trở lên» bật sẵn</span></div>{xbtn()}</div>
<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;border:1px dashed {LINE};border-radius:8px;padding:10px 12px"><div style="font-size:14px"><b>Cách tính và giới hạn</b> <span style="color:{MUT}">· mở ra để đọc</span></div>{pill("Mở")}</div>''')
    C=section("Những gì khối này không nói được","Sẽ ghi trong «Cách tính và giới hạn».",
      '<div style="display:flex;flex-direction:column;gap:10px">'+
      note("LƯU Ý","Túi từ 15 BG trở lên chưa phải kết luận đóng sai","Đây là dấu hiệu cần nhắc. Cỡ túi chỉ đếm bưu gửi nội tỉnh; hàng đi tỉnh khác nằm cùng túi không tính.")+
      note("LƯU Ý","Ngưỡng 15 và dấu «từ 15 trở lên» (≥)","Ngưỡng 15 là mặc định, đặt ở tham số hệ thống; dấu ≥ chưa được PO xác nhận lần cuối. Bảng không gồm 6 BCVH làm nơi đóng.")+
      note("THÔNG TIN","Giới hạn của số liệu",f'Ngày này chỉ có {d["noi_lon"]} nơi đóng túi lớn nên không hiển thị tỷ trọng 8 nơi đầu. 531120: chưa biết có thoả thuận đóng chuyến riêng hay không. Nơi đóng chuyến thư có thể không phải điểm chấp nhận gốc; hệ thống chưa có cột điểm chấp nhận. Chưa tính hàng hoàn. «Cao thứ N trong 29 ngày» so với 11/10 đến 08/11; ngày 09/11 chưa trọn nên không tính. Số lấy từ bản sao DB lúc 15:23 ngày 12/11/2026; nếu DB thật nạp bổ sung sau đó, số có thể khác.')+
      '</div>')
    return f'''<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>Hướng đóng chuyến nội tỉnh — {d["ngay"]}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&amp;family=Playfair+Display:wght@600;700&amp;display=swap" rel="stylesheet">
<style>
body{{margin:0}}
a{{color:{BR}}}a:hover{{color:#33124E}}
</style>
</helmet>
<div style="background:{CREAM};color:{INK};{BODY};font-size:14px;line-height:1.5;min-height:{d["h"]}px;box-sizing:border-box;padding:20px 24px 48px">
<div style="width:100%;display:flex;flex-direction:column;gap:20px">
<header style="background:{BR};border-radius:10px;padding:0 12px;display:flex;flex-wrap:wrap;align-items:center;gap:4px">{top}</header>
<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between"><div style="display:flex;flex-direction:column;gap:2px"><div style="font-size:12.5px;color:{MUT};font-weight:600">Trung tâm Khai thác · 530100 · Hàng tại KTT</div><h1 style="margin:0;{PF};font-size:28px;line-height:1.2;font-weight:700;color:{BR}">Hướng đóng chuyến nội tỉnh</h1></div><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><span style="font-size:12.5px;color:{MUT};font-weight:600">Phạm vi số liệu</span><span style="font-size:12.5px;font-weight:700;color:{BR};background:{SOFT};border-radius:6px;padding:4px 10px">{d["ngay"]}, 1 ngày (số thật)</span><span style="font-size:12.5px;font-weight:700;color:{BR};background:{SOFT};border-radius:6px;padding:4px 10px">Ngưỡng: từ 15 BG trong túi</span></div></div>
<nav aria-label="Trang con" style="display:flex;flex-wrap:wrap;gap:6px;background:#fff;border:1px solid {LINE};border-radius:10px;padding:8px 10px">{nav}</nav>
{filt}
{A}
{B}
</div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":1366,"height":{d["h"]}}}}}'>
class Component extends DCLogic {{
renderVals() {{
return {{}};
}}
}}
</script>
</body>
</html>
'''
d1 = dict(ngay="03/11/2026", h=2200, noi_lon=5, nho_lon_noi=21, pct531="82",
  rk="cao thứ 2 trong 29 ngày (11/10 đến 08/11)",
  rows=[dict(ma="531120",ten="Khách hàng lớn",lh="GD3",lon=411,nho=0,tui=1,max=411),
        dict(ma="531600",ten="Trần Hưng Đạo",lh="GD3",lon=31,nho=2,tui=1,max=32),
        dict(ma="535300",ten="Hương Trà",lh="GD2",lon=23,nho=0,tui=1,max=26),
        dict(ma="536210",ten="Thủy Phương",lh="VHX",lon=20,nho=19,tui=1,max=20),
        dict(ma="531110",ten="Hành chính công",lh="GD3",lon=17,nho=0,tui=1,max=17)],
  small=dict(noi=28,nho=151), tot=dict(noi=33,lon=502,nho=172,tui=5,dong=674),
  huong={"531120":[142,61,58,70,54,26],"531600":[14,5,3,6,2,1],"535300":[3,2,15,1,1,1],"536210":[6,9,1,2,2,0],"531110":[9,3,2,2,1,0]},
  lhtxt=["531120: 411 (81,9%)","GD2/GD3: 71 (14,1%, 3 nơi)","VHX: 20 (4,0%, 1 nơi)","GD1: 0"])
d2 = dict(ngay="08/11/2026", h=1950, noi_lon=1, nho_lon_noi=13, pct531="100",
  rk="cao thứ 7 trong 29 ngày (11/10 đến 08/11)",
  rows=[dict(ma="531120",ten="Khách hàng lớn",lh="GD3",lon=166,nho=13,tui=1,max=166)],
  small=dict(noi=2,nho=2), tot=dict(noi=3,lon=166,nho=15,tui=1,dong=181),
  huong={"531120":[58,25,24,28,22,9]},
  lhtxt=["531120: 166 (100%)","GD2/GD3: 0","VHX: 0","GD1: 0"])
open(f"{root}/project/Main.dc.html","w").write(page(d1))
open(f"{root}/project/Ngay-08-11.dc.html","w").write(page(d2))
c=json.load(open(f"{root}/project/canvas.json"))
c["boards"]["Main.dc.html"].update(w=1366,h=d1["h"]); c["boards"]["Ngay-08-11.dc.html"].update(w=1366,h=d2["h"],x=1446)
c["notes"]["t1"]["maxW"]=2800
c["notes"]["n1"]={"x":0,"y":d1["h"]+120,"w":520,"text":"Bỏ khối «Những gì khối này không nói được» và hai tab «Tồn tại và Gợi ý», «Dữ liệu rà soát tổng thể». Bảng hướng đi ghi rõ đơn vị là bưu gửi, thêm cột «Số túi». Dựng theo chuẩn trang «Đối chiếu BCVH» (canvas v22): thanh menu tím, tiêu đề Playfair 28, thanh trang con có tab mới, hàng bộ lọc, mỗi khối là một thẻ trắng viền #E4D5AE với tiêu đề Playfair 22, thẻ số viền trên màu, thanh trên nền kem, đầu bảng nền kem #FAF5E8, thẻ «LƯU Ý / THÔNG TIN» viền trái. Vị trí tab sau «Đối chiếu BCVH» là đề xuất.","fill":"orange"}
c["notes"]["n2"]={"x":600,"y":d1["h"]+120,"w":520,"text":"Bảng «túi đi hướng nào»: số theo BCVH là minh hoạ, tổng khớp số thật. Ngày 08/11 chỉ một nơi (531120): bảng hướng đi một dòng, một dòng gộp «2 nơi chỉ có túi dưới 15 BG».","fill":"blue"}
json.dump(c,open(f"{root}/project/canvas.json","w"),ensure_ascii=False,indent=1)
