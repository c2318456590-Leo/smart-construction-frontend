# -*- coding: utf-8 -*-
import cv2

path = r'C:\Users\23184\Downloads\提示词_：临边防护区违规（主攻：未戴安全帽_入侵_.mp4'
cap = cv2.VideoCapture(path)
print('opened:', cap.isOpened())
print('总帧数:', cap.get(cv2.CAP_PROP_FRAME_COUNT))
print('FPS:', cap.get(cv2.CAP_PROP_FPS))

ok, fail = 0, 0
for i in range(100):
    r, f = cap.read()
    if r and f is not None:
        ok += 1
    else:
        fail += 1
        if fail <= 3:
            print(f'第{i}帧读取失败')
print(f'前100帧: 成功{ok} 失败{fail}')
cap.release()
