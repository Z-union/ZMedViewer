<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=social.displayInfo displayWide=(realm.password && social.providers??); section>
    <#if section = "header">
        <#--  ${msg("loginAccountTitle")}  -->
    <#elseif section = "form">
    <div id="row">
        <div id="column">
            <div id="kc-form">
                <div id="kc-form-wrapper">
                    <div>
                        <div id="logo"></div>
                        <div id="title">Вход в личный кабинет</div>
                        <#if realm.password>
                        <#--  <form id="kc-form-login" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">  -->
                        <form id="kc-form-login" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
                            <#if !usernameHidden??>
                                <div class="${properties.kcFormGroupClass!}">
                                    <div class="mdc-text-field mdc-text-field--filled ${properties.kcLabelClass!} <#if usernameEditDisabled??>mdc-text-field--disabled</#if>">
                                        <input required id="username" class="mdc-text-field__input ${properties.kcInputClass!}" name="username" value="${(login.username!'')}" type="text" autofocus autocomplete="off" <#if usernameEditDisabled??>disabled</#if>>
                                        <label for="username" class="mdc-floating-label ${properties.kcLabelClass!}">
                                            <#if !realm.loginWithEmailAllowed>
                                                ${msg("username")}
                                            <#elseif !realm.registrationEmailAsUsername>
                                                ${msg("usernameOrEmail")}
                                            <#else>
                                                ${msg("email")}
                                            </#if>
                                        </label>
                                        <div class="mdc-line-ripple"></div>
                                    </div>

                                    <#--  <label for="username" class="${properties.kcLabelClass!}"><#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if></label>  -->

                                    <#--  <input tabindex="1" id="username" class="${properties.kcInputClass!}" name="username" value="${(login.username!'')}"  type="text" autofocus autocomplete="off"
                                        aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
                                    />  -->

                                    <#--  <#if messagesPerField.existsError('username','password')>
                                        <span id="input-error" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                                                ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
                                        </span>
                                    </#if>  -->

                                </div>
                            </#if>
                            <div>
                            </div>
                            <div class="${properties.kcFormGroupClass!}">
                                <div class="mdc-text-field mdc-text-field--filled ${properties.kcLabelClass!}">
                                    <input tabindex="0" required id="password" class="mdc-text-field__input ${properties.kcInputClass!}" name="password" type="password" autocomplete="off">
                                    <div class="mdc-line-ripple"></div>
                                    <label for="password" class="mdc-floating-label ${properties.kcLabelClass!}">${msg("password")}</label>
                                </div>
                                <#--  <label for="password" class="${properties.kcLabelClass!}">${msg("password")}</label>

                                <input tabindex="2" id="password" class="${properties.kcInputClass!}" name="password" type="password" autocomplete="off"
                                    aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
                                />

                                <#if usernameHidden?? && messagesPerField.existsError('username','password')>
                                    <span id="input-error" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                                            ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
                                    </span>
                                </#if>  -->
                            </div>

                            <#--  <div class="${properties.kcFormGroupClass!} ${properties.kcFormSettingClass!}">
                                <div id="kc-form-options">
                                    <#if realm.rememberMe && !usernameHidden??>
                                        <div class="checkbox">
                                            <label>
                                                <#if login.rememberMe??>
                                                    <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox" checked> ${msg("rememberMe")}
                                                <#else>
                                                    <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox"> ${msg("rememberMe")}
                                                </#if>
                                            </label>
                                        </div>
                                    </#if>
                                    </div>
                                    <div class="${properties.kcFormOptionsWrapperClass!}">
                                        <#if realm.resetPasswordAllowed>
                                            <span><a tabindex="5" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a></span>
                                        </#if>
                                    </div>

                            </div>  -->

                            <div id="kc-form-buttons" class="${properties.kcFormGroupClass!}">
                                <div class="buttons-space">
                                </div>
                                <button class="mdc-button mdc-button--raised" name="login" id="kc-login" type="submit">
                                    <span class="mdc-button__label">${msg("doLogIn")}</span>
                                </button>
                                <#--  <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>  -->
                                <#--  <input tabindex="4" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}" name="login" id="kc-login" type="submit" value="${msg("doLogIn")}"/>  -->
                            </div>
                        </form>
                        </#if>
                    </div>
                </div>
            </div>
        </div>
        <div id="column">
        </div>
    </div>
    <#elseif section = "info" >
        <#--  <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
            <div id="kc-registration-container">
                <div id="kc-registration">
                    <span>${msg("noAccount")} <a tabindex="6"
                                                 href="${url.registrationUrl}">${msg("doRegister")}</a></span>
                </div>
            </div>
        </#if>  -->
    </#if>

</@layout.registrationLayout>