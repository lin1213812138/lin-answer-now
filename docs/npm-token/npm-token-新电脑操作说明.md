# 在新电脑上配置 npm token（跳过 2FA 验证页）

## 为什么需要这个

`npm login` 现在走网页授权。账号开了 2FA 后，浏览器必然出现 **Two-Factor Authentication / Security key** 页面，
且**没有任何可以输入 token 的地方** —— token 不是登录用的东西，而是登录之后才能生成的东西。

所以正确做法不是"在登录页填 token"，而是：**先在随便一台能登录的机器上生成 token，再把 token 直接写进新电脑的 `.npmrc`。**
`.npmrc` 里已经有凭证时，npm 压根不会走登录流程，因此永远不会弹 2FA。

---

## 第 1 步：在已登录的机器上生成 token（只需一次）

1. 浏览器打开 https://www.npmjs.com/settings/~your-username/tokens
   （或 npmjs.com → 右上头像 → **Access Tokens**）
2. 点 **Generate New Token** → 选 **Classic Token**
3. 类型必须选 **Automation**
   - Automation = 天生免 OTP，这是 CI 能发布、新电脑不弹验证的原因
   - Publish 类型在 auth-and-writes 策略下仍会要 OTP，别选
4. 点 **Generate Token** → 页面显示 `npm_xxxxxxxx...`
5. **立刻复制**：这串值只显示这一次，关掉就再也看不到了，只能删掉重建

> 若账号页面要求先过 2FA 才能生成 token，说明那台机器得先能通过验证（安全密钥/passkey/恢复码）。
> 已登录过的机器通常处于会话有效状态，直接就能进 Tokens 页面。

---

## 第 2 步：把 token 带到新电脑

三种方式，择一即可：

| 方式 | 做法 |
| --- | --- |
| 手动最快 | 随便用记事本/微信传给自己，粘进 `.npmrc` |
| 密码库 | 存进 1Password / Bitwarden 共享条目，新电脑取出 |
| 环境变量 | 设置 `NPM_TOKEN`，脚本自动读取 |

**注意**：token 等同于账号发布权限，别发到群里、别提交进 git 仓库。

---

## 第 3 步：写进新电脑的 .npmrc

### 方式 A：跑脚本（推荐，带备份和验证）

把 `setup-npm-token.ps1` 拷到新电脑，PowerShell 里执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-npm-token.ps1
```

或直接右键 → "使用 PowerShell 运行"。脚本会提问让你粘贴 token（输入不显示），
然后备份旧配置、写入 `.npmrc`、最后用 `npm whoami` 验证。

### 方式 B：手工编辑

打开（不存在就新建）：

```text
C:\Users\<你的用户名>\.npmrc
```

写入这两行：

```ini
registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=npm_你的token
```

保存即可，无需重启。

### 方式 C：一条命令搞定

```powershell
npm config set //registry.npmjs.org/:_authToken npm_你的token
```

---

## 第 4 步：验证

```powershell
npm whoami
```

能打印出你的 npm 用户名 = 成功。之后：

```powershell
npm install          # 私有包/公开包都正常
npm publish          # 不会再弹 Security key
```

---

## 常见问题

**Q: 还是弹 2FA？**
说明 `.npmrc` 没被读到。检查：
```powershell
npm config get userconfig              # 应指向 C:\Users\你\.npmrc
npm config get //registry.npmjs.org/:_authToken   # 应显示你的 token
```
如果项目目录下有另一个 `.npmrc` 且没这行，项目级配置会覆盖用户级，补上即可。

**Q: `npm whoami` 报 401 / E401？**
token 失效或被撤销了。回 npmjs 删掉旧的、重新生成一个 Automation token。

**Q: 用私有源（公司 Verdaccio / Nexus / 淘宝镜像）怎么办？**
把 `registry.npmjs.org` 换成你的源地址，例如：
```ini
registry=https://registry.npmmirror.com/
//registry.npmmirror.com/:_authToken=npm_你的token
```
注意镜像是只读代理的话，发布仍需指向官方源。

**Q: 多个 registry 同时用？**
一行一个，互不冲突：
```ini
//registry.npmjs.org/:_authToken=npm_aaa
//npm.company.com/:_authToken=npm_bbb
@mycompany:registry=https://npm.company.com/
```

**Q: 想撤销 / 换电脑时清理？**
```powershell
npm config delete //registry.npmjs.org/:_authToken
```
并去 npmjs.com → Access Tokens 删除对应 token。

---

## 一句话总结

**不要在新电脑上试图登录。** 在已登录的机器生成 Automation token → 粘进新电脑 `%USERPROFILE%\.npmrc` → `npm whoami` 验证通过 → 结束。
