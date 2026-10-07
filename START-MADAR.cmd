@echo off
setlocal
chcp 65001 >nul
title Madar - Start
pushd "%~dp0"

echo.
echo تشغيل مدار — خلي هذه النافذة مفتوحة أثناء استخدام الموقع.
echo.
where node >nul 2>nul
if errorlevel 1 goto missing_node
where npm.cmd >nul 2>nul
if errorlevel 1 goto missing_node
node -e "if (Number(process.versions.node.split('.')[0]) < 22) process.exit(1)"
if errorlevel 1 goto missing_node
if not exist package-lock.json goto missing_project
if exist node_modules\.package-lock.json goto start_app
echo أول تشغيل: جارٍ تنزيل ملفات التشغيل. تحتاج اتصال إنترنت.
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto failed_install

:start_app
echo.
echo راح يفتح الموقع بالمتصفح. لإيقافه اضغط Ctrl+C هنا.
echo إذا ظهرت شاشة إعداد السحابة، اضغط «جرّب مدار بدون حساب» لتشوف التصميم.
echo.
call npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort --open
if errorlevel 1 goto failed_start
goto finish

:missing_node
echo تحتاج تثبّت Node.js إصدار 22 أو أحدث، ثم تعيد فتح هذا الملف.
echo نزّل نسخة LTS من https://nodejs.org
goto failed

:missing_project
echo ما لقينا ملفات المشروع. فك ضغط الملف كله، ثم افتح START-MADAR.cmd من داخل مجلد madar.
goto failed

:failed_install
echo تعذّر تنزيل ملفات التشغيل. تأكد من الإنترنت، ثم افتح START-MADAR.cmd مرة ثانية.
goto failed

:failed_start
echo تعذّر تشغيل الموقع. إذا نسخة مدار القديمة شغالة، أوقفها بـ Ctrl+C ثم جرّب من جديد.
echo احتفظ برسالة الخطأ الظاهرة أعلاه حتى نقدر نحلّها.
goto failed

:failed
pause
popd
endlocal
exit /b 1

:finish
popd
endlocal
