-- ================================================================
-- KIRAYU SUPABASE REPORTER v2
-- ================================================================

-- ⚙️ CONFIG
local SUPABASE_URL  = "https://aamxhmrecxtiecjevyht.supabase.co"
local SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhbXhobXJlY3h0aWVjamV2eWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNTY1MzgsImV4cCI6MjA5NjkzMjUzOH0.RJDYdY9wPVHTerzx9t9PgMKkEGv3zVp-WPF1joYGRL0"
local SEND_INTERVAL = 30  -- seconds between syncs

-- ── SERVICES ─────────────────────────────────────────────────────
local Players     = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local Workspace   = workspace

-- ── LOCAL ALIASES ────────────────────────────────────────────────
local task_wait    = task.wait
local task_spawn   = task.spawn
local math_floor   = math.floor
local os_date      = os.date
local os_time      = os.time
local string_match = string.match
local table_insert = table.insert

-- ── HTTP FUNCTION (try all known executor APIs) ───────────────────
local requestFunc = request
    or http_request
    or (syn         and syn.request)
    or (fluxus      and fluxus.request)
    or (krnl        and krnl.request)
    or (electron    and electron.request)
    or (oxygen      and oxygen.request)
    or (Drawing     and Drawing.new and request) -- fallback

-- ── ISO 8601 TIMESTAMP ───────────────────────────────────────────
local function getISO8601()
    return os_date("!%Y-%m-%dT%H:%M:%S.000Z", os_time())
end

-- ── LOBBY DETECTION ──────────────────────────────────────────────
local cachedMap
local function isLobby()
    if not cachedMap or not cachedMap.Parent then
        cachedMap = Workspace:FindFirstChild("Map")
    end
    if not cachedMap then return false end
    return cachedMap:FindFirstChild("AFKLobby") ~= nil
        or cachedMap:FindFirstChild("TradingPlazaLobby") ~= nil
end

-- ── SAFE REQUIRE (avoid crashing on bad module) ──────────────────
local function safeRequire(mod)
    if not mod then return nil end
    local ok, result = pcall(require, mod)
    return ok and result or nil
end

-- ── FIND DATA HANDLER (multiple fallback paths) ──────────────────
local function findDH(pGui)
    -- Primary path
    local m = pGui:FindFirstChild("LogicHolder")
        and pGui.LogicHolder:FindFirstChild("ClientLoader")
        and pGui.LogicHolder.ClientLoader:FindFirstChild("Modules")
        and pGui.LogicHolder.ClientLoader.Modules:FindFirstChild("ClientDataHandler")
    if m then
        local dh = safeRequire(m)
        if dh then return dh end
    end

    -- Fallback: deep search entire PlayerGui for ClientDataHandler
    local found = pGui:FindFirstChild("ClientDataHandler", true)
    if found then
        local dh = safeRequire(found)
        if dh then return dh end
    end

    return nil
end

-- ── MAIN ─────────────────────────────────────────────────────────
task_spawn(function()
    if not game:IsLoaded() then game.Loaded:Wait() end

    -- LocalPlayer
    local LP = Players.LocalPlayer
    if not LP then
        LP = Players:WaitForChild("LocalPlayer", 120)
    end
    if not LP then return warn("[Supabase] No LocalPlayer after 120s") end

    -- PlayerGui
    local pGui = LP:WaitForChild("PlayerGui", 60)
    if not pGui then return warn("[Supabase] No PlayerGui") end

    -- GameGui + Screen
    local gameGui = pGui:WaitForChild("GameGui", 300)
    if not gameGui then return warn("[Supabase] No GameGui after 300s") end
    gameGui:WaitForChild("Screen", 60)

    -- ── Resolve DataHandler — fast retries first, slow fallback ──
    -- Other script already loaded the game so DH is usually ready fast
    local DH
    for attempt = 1, 600 do
        DH = findDH(pGui)
        if DH then
            print("[Supabase] DH found on attempt", attempt)
            break
        end
        -- First 30 attempts: every 0.2s (6s total)
        -- Next 60 attempts:  every 0.5s (30s total)
        -- After that:        every 1s
        if attempt <= 30 then
            task_wait(0.2)
        elseif attempt <= 90 then
            task_wait(0.5)
        else
            task_wait(1)
        end
    end
    if not DH then return warn("[Supabase] No data handler — giving up") end

    -- ── Pre-resolve UI paths ──────────────────────────────────────
    local invButton
    pcall(function()
        invButton = LP.PlayerGui.GameGui.Screen.Left.Sidebar.Items.Inventory.Items.Button
    end)

    local invFrame, invSF
    local function resolveInvPaths()
        if invFrame and invSF and invFrame.Parent and invSF.Parent then return true end
        return pcall(function()
            local inv = pGui.GameGui.Screen.Middle.Inventory.Inventory
            invFrame  = inv.Frame
            invSF     = invFrame.Items.Items.ScrollingFrame
        end) and invFrame ~= nil
    end

    -- ── HTTP config (built once) ──────────────────────────────────
    local url = SUPABASE_URL .. "/rest/v1/accounts?on_conflict=username"
    local baseHeaders = {
        ["apikey"]        = SUPABASE_KEY,
        ["Authorization"] = "Bearer " .. SUPABASE_KEY,
        ["Content-Type"]  = "application/json",
    }
    local headers = {
        ["apikey"]        = SUPABASE_KEY,
        ["Authorization"] = "Bearer " .. SUPABASE_KEY,
        ["Content-Type"]  = "application/json",
        ["Prefer"]        = "resolution=merge-duplicates,return=minimal",
    }

    -- ── Fetch PC name from gtd_imported_accounts ──────────────────
    local PC_NAME = ""
    pcall(function()
        -- Fetch all accounts from FarmSync to find this username's device
        local FARMSYNC_TOKEN = "5af9cbb1e6f19bd52d720ceba7c3549d4193c13e96ac476bd2c4c49ef214ec0c"
        local fsHeaders = {
            ["Authorization"] = "Bearer " .. FARMSYNC_TOKEN,
            ["Content-Type"]  = "application/json",
        }

        -- Get accounts to find device_id for this username
        local accRes = requestFunc({
            Url     = "https://api.farmsync.cloud/api/self/accounts",
            Method  = "GET",
            Headers = fsHeaders,
        })
        local deviceId = nil
        if accRes and accRes.StatusCode == 200 then
            local ok2, accs = pcall(function() return HttpService:JSONDecode(accRes.Body) end)
            if ok2 and accs then
                for _, a in ipairs(accs) do
                    if a.username and a.username:lower() == LP.Name:lower() then
                        deviceId = a.device_id
                        break
                    end
                end
            end
        end

        -- Get devices to resolve device_id → PC label
        if deviceId then
            local devRes = requestFunc({
                Url     = "https://api.farmsync.cloud/api/devices",
                Method  = "GET",
                Headers = fsHeaders,
            })
            if devRes and devRes.StatusCode == 200 then
                local ok3, body = pcall(function() return HttpService:JSONDecode(devRes.Body) end)
                if ok3 and body then
                    local devList = body.value or body
                    if type(devList) == "table" then
                        for _, d in ipairs(devList) do
                            if d.id == deviceId then
                                local note = d.device_note and d.device_note:match("^%s*(.-)%s*$") or ""
                                PC_NAME = (note ~= "") and note or (d.device_name or deviceId)
                                break
                            end
                        end
                    end
                end
            end
        end
    end)
    print("[Supabase] Ready:", LP.Name, "| PC:", PC_NAME ~= "" and PC_NAME or "(unassigned)")

    -- ── Dedup state ───────────────────────────────────────────────
    local lastPayloadKey  = ""
    local lastInvKey      = ""
    local cachedInvJSON   = nil  -- last successfully encoded inventory
    local cachedItemCount = 0    -- item count of last trusted scan
    local lastForcedSync  = 0    -- timestamp of last force-sync
    local FORCE_INTERVAL  = 300  -- force a sync every 5 min even if data unchanged

    -- ── SCAN INVENTORY ───────────────────────────────────────────
    local function scanInventory()
        if invButton and invButton.Parent then
            pcall(function() firesignal(invButton.MouseButton1Click) end)
        end

        if not resolveInvPaths() then
            task_wait(1)
            if not resolveInvPaths() then return nil, false end
        end

        local sf = invSF
        local deadline = os_time() + 1.5
        while os_time() < deadline do
            if #sf:GetChildren() > 0 then break end
            task_wait(0.1)
        end
        if #sf:GetChildren() == 0 then return nil, false end

        local merged, order, displayNames = {}, {}, {}

        -- Scan all row-frames inside the SF; skip bare Frame containers (no Title)
        local function scanAll()
            for _, rowFrame in ipairs(sf:GetChildren()) do
                if rowFrame:IsA("GuiObject") then
                    for _, obj in ipairs(rowFrame:GetChildren()) do
                        if obj:IsA("GuiObject") then
                            -- Only real items have Frame.ImageLabel.Title
                            local titleOk, titleText = pcall(function()
                                return obj.Frame.ImageLabel.Title.Text
                            end)
                            if titleOk and titleText and titleText ~= "" then
                                local qty = 1
                                local countOk, countText = pcall(function()
                                    return obj.Frame.ImageLabel.Count.Text
                                end)
                                if countOk and countText and countText ~= "" then
                                    local d = string_match(countText, "(%d+)")
                                    if d then
                                        local p = tonumber(d)
                                        if p and p > 0 then qty = p end
                                    end
                                end
                                if not merged[obj.Name] then
                                    table_insert(order, obj.Name)
                                    displayNames[obj.Name] = titleText
                                end
                                merged[obj.Name] = qty
                            end
                        end
                    end
                end
            end
        end

        -- Pass 1: scan everything currently in memory at position 0
        scanAll()

        -- Scroll down only — merged dict keeps everything found along the way
        -- so reverse pass is not needed for a 2-column sequential inventory
        pcall(function()
            local viewH = sf.AbsoluteWindowSize.Y
            -- Step = 50% of viewport so each row is scanned at least twice
            local step  = math.max(math.floor(viewH * 0.5), 20)
            local pos   = 0
            local prevCount = #order
            local noNew = 0

            while noNew < 4 do
                pos = pos + step
                sf.CanvasPosition = Vector2.new(0, pos)
                task_wait(0.2)
                scanAll()
                local cur = #order
                if cur > prevCount then
                    noNew = 0
                    prevCount = cur
                else
                    noNew = noNew + 1
                end
                if pos > 30000 then break end
            end

            sf.CanvasPosition = Vector2.new(0, 0)
        end)

        if #order == 0 then return nil, false end

        local inv = {}
        for _, name in ipairs(order) do
            table_insert(inv, { name = name, displayName = displayNames[name], quantity = merged[name] })
        end
        return inv, true
    end

    -- ── SEND DATA ────────────────────────────────────────────────
    local function sendData()
        if not requestFunc then return end  -- executor has no HTTP

        local ok, data = pcall(function() return DH.GetData() end)
        if not ok or not data then return end  -- DH broken, skip cycle

        local inLobby   = isLobby()
        local lobbyStr  = inLobby and "lobby" or "farming"
        local seeds     = math_floor(data.Seeds      or 0)
        local mapName   = tostring(data.Map or data.MapName or "")

        -- ── Inventory: only re-scan when in lobby ─────────────────
        local invJSON = nil
        if inLobby then
            local inv, scanOk = scanInventory()
            if not scanOk then
                -- Scan failed entirely — keep cached inventory
                invJSON = cachedInvJSON
                if not invJSON then return end
            else
                local newCount = #inv
                -- If scan returned far fewer items than we last trusted
                -- (less than 60% of cached count), the UI was likely not
                -- fully loaded — keep the cached inventory instead
                if cachedItemCount > 0 and newCount < cachedItemCount * 0.6 then
                    invJSON = cachedInvJSON
                else
                    -- Trustworthy scan — build dedup key and cache
                    local newInvKey = ""
                    for _, item in ipairs(inv) do
                        newInvKey = newInvKey .. item.name .. "=" .. item.quantity .. ";"
                    end
                    if newInvKey ~= lastInvKey then
                        invJSON       = HttpService:JSONEncode(inv)
                        cachedInvJSON = invJSON
                        lastInvKey    = newInvKey
                        cachedItemCount = newCount
                    else
                        invJSON = cachedInvJSON
                    end
                end
            end
        end

        -- ── Full dedup key (includes all tracked fields) ──────────
        local payloadKey = table.concat({
            lobbyStr, seeds, mapName,
            inLobby and lastInvKey or ""
        }, "|")

        local now = os_time()
        local forceSync = (now - lastForcedSync) >= FORCE_INTERVAL
        if payloadKey == lastPayloadKey and not forceSync then return end
        if forceSync then lastForcedSync = now end

        -- ── Build and send payload ────────────────────────────────
        local payloadTable = {
            username   = LP.Name,
            seeds      = seeds,
            lobby      = lobbyStr,
            updated_at = getISO8601(),
        }
        -- PostgREST expects a JSON array even for single-row upserts
        local bodyStr
        if invJSON then
            local base = HttpService:JSONEncode(payloadTable)
            -- Inject inventory field then wrap in array
            bodyStr = "[" .. base:sub(1, -2) .. ',"inventory":' .. invJSON .. "}]"
        else
            bodyStr = "[" .. HttpService:JSONEncode(payloadTable) .. "]"
        end

        local res = requestFunc({
            Url = url, Method = "POST", Headers = headers, Body = bodyStr,
        })

        if res and res.StatusCode and res.StatusCode >= 200 and res.StatusCode < 300 then
            lastPayloadKey = payloadKey
            print("[Supabase] Synced:", LP.Name, "(" .. lobbyStr .. ")")
        else
            warn("[Supabase ERR]:", res and res.StatusCode or "no response", res and res.Body or "")
        end
    end

    -- ── REPORT LOOP ──────────────────────────────────────────────
    pcall(sendData)
    while true do
        task_wait(SEND_INTERVAL)
        local ok, err = pcall(sendData)
        if not ok then warn("[Supabase] Loop error:", err) end
    end
end)
