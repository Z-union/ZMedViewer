<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="ru">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="robots" content="noindex, nofollow" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />

  <#if properties.meta?has_content>
    <#list properties.meta?split(' ') as meta>
      <meta name="${meta?split('==')[0]}" content="${meta?split('==')[1]}"/>
    </#list>
  </#if>

  <title>Log in to ZMED</title>
  <link rel="shortcut icon" href="${url.resourcesPath}/img/favicon.ico" />
  <link href="https://fonts.googleapis.com/css?family=Inter:100,300,400,500,700&display=swap" rel="stylesheet" as="style">

  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { height:100%; }
    body {
      margin:0; background:#000; color:#fff;
      font-family:'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Ubuntu, Cantarell, 'Noto Sans', Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji';
    }
    button, input { appearance:none; -webkit-appearance:none; font:inherit; color:inherit; background:none; border:none; padding:0; }

    /* Сцена и фон */
    #wrap { position:relative; isolation:isolate; min-height:100vh; width:100vw; overflow:hidden; }
    #bg {
      pointer-events:none; position:absolute; inset:0; z-index:0;
      background-position:center; background-size:cover; background-repeat:no-repeat; opacity:.6;
      background-image:url('${url.resourcesPath}/img/bg.svg');
    }

    /* Центрирование */
    #main { position:relative; z-index:10; min-height:100vh; width:100vw; display:flex; align-items:center; justify-content:center; }
    #container { width:90vw; min-height:100vh; display:flex; align-items:center; justify-content:center; gap:32px; }
    #col { flex:0 0 auto; }
    #vcenter { display:flex; flex-direction:column; justify-content:center; }
    #box { margin:0 auto; }

    /* Шапка формы */
    #logo {
      margin-bottom:50px; height:78px; width:265px;
      background-repeat:no-repeat; background-size:contain; background-position:left center;
      background-image:url('${url.resourcesPath}/img/login-logo.svg');
    }
    #title { margin-bottom:60px; font-size:30px; font-weight:400; text-align:left; }

    /* Ошибка */
    #err {
      border-radius:8px; border:1px solid rgba(248,113,113,1);
      background:rgba(239,68,68,0.10); padding:8px 12px; color:#fca5a5;
      box-shadow:0 1px 2px rgba(0,0,0,.25); max-width:300px;
    }

    /* Формы */
    #form { display:block; }
    .spaceY6 > * + * { margin-top:24px; }

    .field { position:relative; width:300px; }
    .input {
      height:48px; width:100%;
      border:0; border-bottom:1px solid rgba(255,255,255,.40);
      background:transparent; color:#fff; outline:none;
      padding:20px 12px 8px 12px; /* pt-5 px-3 pb-2 */
      transition:border-color .15s ease;
      caret-color:#fff;
    }
    .input:focus { border-bottom-color:#ffffff; }
    .label {
      position:absolute; left:12px; top:12px;
      color:rgba(255,255,255,.80); pointer-events:none; transition:all .15s ease; font-size:16px;
    }
    .input:not(:placeholder-shown) + .label,
    .input:focus + .label { top:4px; font-size:12px; }

    /* Автозаполнение и валидация — фиксы цвета/подчёркиваний */
    input:-webkit-autofill {
      -webkit-box-shadow:0 0 0px 1000px transparent inset !important;
      -webkit-text-fill-color:#fff !important;
      transition: background-color 5000s ease-in-out 0s;
    }
    input:-webkit-autofill + .label,
    input:-internal-autofill-selected + .label { top:4px; font-size:12px; }
    /* Отключаем красные подчеркивания/рамки от валидности и spellcheck */
    input:invalid { box-shadow:none; outline:0; }
    input:-moz-ui-invalid { box-shadow:none; }
    input::-webkit-contacts-auto-fill-button { visibility:hidden; display:none !important; pointer-events:none; position:absolute; right:0; }
    ::-webkit-credentials-auto-fill-button { visibility:hidden; display:none !important; }

    .h30 { height:30px; width:auto; }

    /* Кнопка */
    #btn {
      display:inline-flex; align-items:center; justify-content:center;
      border-radius:8px; background:#fff; padding:12px 24px; /* px-6 py-3 */
      font-weight:500; color:#000; box-shadow:0 2px 6px rgba(0,0,0,.25); cursor:pointer;
    }
    #btn:hover { filter:brightness(.90); }
    #btn:focus { outline:2px solid rgba(255,255,255,.5); outline-offset:2px; }

    /* Нижняя плашка */
    #foot {
      pointer-events:none; position:fixed; left:0; bottom:0; z-index:20; margin:0; width:100%;
      background:rgba(255,255,255,.05); padding:12px 20px; text-align:center;
      font-size:12px; color:rgba(255,255,255,.90); backdrop-filter:blur(6px);
    }
  </style>
</head>
<body>
  <div id="wrap">
    <div id="main">
      <div id="container">
        <div id="col">
          <div id="vcenter">
            <div id="box">
              <div id="logo" aria-label="Логотип"></div>
              <div id="title">Вход в личный кабинет</div>

              <#if message?has_content>
                <div id="err">${message.summary}</div>
              </#if>

              <form id="form" class="spaceY6" onsubmit="login.disabled=true; return true;" action="${url.loginAction}" method="post">
                <input type="hidden" id="id-hidden-input" name="credentialId"
                       value="<#if auth?has_content && auth.selectedCredential?has_content>${auth.selectedCredential}</#if>"/>

                <div class="field">
                  <input id="username" name="username" type="text" required autocomplete="username"
                         value="${login.username!''}" class="input" placeholder=" "
                         spellcheck="false" autocapitalize="off" autocorrect="off" />
                  <label for="username" class="label">Логин</label>
                </div>

                <div class="field">
                  <input id="password" name="password" type="password" required autocomplete="current-password"
                         class="input" placeholder=" " spellcheck="false" autocapitalize="off" autocorrect="off" />
                  <label for="password" class="label">Пароль</label>
                </div>

                <div class="h30"></div>
                <button type="submit" id="btn" name="login">Войти</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="bg" aria-hidden="true"></div>
    <div id="foot">For best user experience please use Google Chrome browser</div>
  </div>
</body>
</html>
