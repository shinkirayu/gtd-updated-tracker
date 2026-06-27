-- ⚙️ CONFIG
local SUPABASE_URL  = "https://aamxhmrecxtiecjevyht.supabase.co"
local SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhbXhobXJlY3h0aWVjamV2eWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNTY1MzgsImV4cCI6MjA5NjkzMjUzOH0.RJDYdY9wPVHTerzx9t9PgMKkEGv3zVp-WPF1joYGRL0"
local SEND_INTERVAL  = 30    -- seconds between syncs
local FORCE_INTERVAL = 300   -- force sync even if nothing changed

-- ── SERVICES ─────────────────────────────────────────────────────
local Players     = game:GetService("Players")
local RS          = game:GetService("ReplicatedStorage")
local HttpService = game:GetService("HttpService")

-- ── HTTP FUNCTION ─────────────────────────────────────────────────
local requestFunc = request
    or http_request
    or (syn      and syn.request)
    or (fluxus   and fluxus.request)
    or (krnl     and krnl.request)
    or (electron and electron.request)
    or (oxygen   and oxygen.request)

-- ── HELPERS ──────────────────────────────────────────────────────
local function getISO8601()
    return os.date("!%Y-%m-%dT%H:%M:%S.000Z", os.time())
end

local cachedMap
local function isLobby()
    if not cachedMap or not cachedMap.Parent then
        cachedMap = workspace:FindFirstChild("Map")
    end
    if not cachedMap then return false end
    return cachedMap:FindFirstChild("AFKLobby") ~= nil
        or cachedMap:FindFirstChild("TradingPlazaLobby") ~= nil
end

-- ── MAIN ─────────────────────────────────────────────────────────
task.spawn(function()
    if not game:IsLoaded() then game.Loaded:Wait() end

    local LP = Players.LocalPlayer or Players:WaitForChild("LocalPlayer", 120)
    if not LP then return warn("[Supabase] No LocalPlayer") end

    local pGui = LP:WaitForChild("PlayerGui", 60)
    if not pGui then return warn("[Supabase] No PlayerGui") end

    pGui:WaitForChild("GameGui", 300)
    if not LP.Character then LP.CharacterAdded:Wait() end

    -- ── CONFIG SCRAPE (names + images, runs once at startup) ──────
    local IMAGE_FIELDS = { "Old__Image", "Image", "Thumbnail", "Icon", "ImageId", "AssetId", "Img" }
    local NameCache  = {}
    local ImageCache = {}

    local function extractImage(data)
        for _, f in ipairs(IMAGE_FIELDS) do
            local v = data[f]
            if v then
                local s = tostring(v)
                if s:find("^rbxassetid://") then return s end
                if tonumber(s) then return "rbxassetid://" .. s end
            end
        end
    end

    local function scrapeFolder(folder)
        if not folder then return end
        local list = folder:GetChildren()
        for i, m in ipairs(list) do
            if m:IsA("ModuleScript") then
                local ok, d = pcall(require, m)
                if ok and type(d) == "table" then
                    if d.Name then NameCache[m.Name] = d.Name end
                    local img = extractImage(d)
                    if img then ImageCache[m.Name] = img end
                end
            end
            if i % 25 == 0 then task.wait() end
        end
    end

    local ok, ItemData = pcall(function()
        return pGui
            :WaitForChild("LogicHolder", 30)
            :WaitForChild("ClientLoader", 30)
            :WaitForChild("SharedConfig", 30)
            :WaitForChild("ItemData", 30)
    end)

    if ok and ItemData then
        local UnitsFolder = ItemData:FindFirstChild("Units")
        if UnitsFolder then
            scrapeFolder(UnitsFolder:FindFirstChild("Configs"))
        end
        for _, obj in ipairs(ItemData:GetDescendants()) do
            if obj:IsA("ModuleScript") and obj.Name:find("^dp_") then
                local ok2, d = pcall(require, obj)
                if ok2 and type(d) == "table" then
                    if d.Name then NameCache[obj.Name] = d.Name end
                    local img = extractImage(d)
                    if img then ImageCache[obj.Name] = img end
                end
            end
        end
        print("[Supabase] Config scrape done.")
    else
        warn("[Supabase] ItemData not found - names/images will be IDs only")
    end

    -- ── HTTP CONFIG ───────────────────────────────────────────────
    local url = SUPABASE_URL .. "/rest/v1/accounts?on_conflict=username"
    local headers = {
        ["apikey"]        = SUPABASE_KEY,
        ["Authorization"] = "Bearer " .. SUPABASE_KEY,
        ["Content-Type"]  = "application/json",
        ["Prefer"]        = "resolution=merge-duplicates,return=minimal",
    }

    print("[Supabase] Ready:", LP.Name)

    -- ── DEDUP STATE ───────────────────────────────────────────────
    local lastPayloadKey = ""
    local lastForcedSync = 0

    -- ── READ UPVALUE ──────────────────────────────────────────────
    local function readPlayerData()
        if not (getconnections and getupvalues) then return nil end
        local re = RS:FindFirstChild("RemoteEvents")
        if not re then return nil end

        for _, evtName in ipairs({ "LoadPlayerData", "UpdatePlayerData", "UpdateUnitInventory" }) do
            local evt = re:FindFirstChild(evtName)
            if not evt then continue end
            for _, conn in ipairs(getconnections(evt.OnClientEvent)) do
                if not conn.Function then continue end
                local ok2, uvs = pcall(getupvalues, conn.Function)
                if not ok2 then continue end
                for _, uv in pairs(uvs) do
                    if type(uv) ~= "table" then continue end
                    local inv = rawget(uv, "Inventory")
                    if type(inv) ~= "table" then continue end
                    return {
                        Inventory   = inv,
                        Seeds       = rawget(uv, "Seeds"),
                        LuckyBlocks = rawget(uv, "LuckyBlocks"),
                        Boosts      = rawget(uv, "Boosts"),
                        GamePasses  = rawget(uv, "GamePasses"),
                    }
                end
            end
        end
        return nil
    end

    -- ── SEND DATA ─────────────────────────────────────────────────
    local function sendData()
        if not requestFunc then return end

        local data = readPlayerData()
        if not data then
            warn("[Supabase] Could not read player data upvalue")
            return
        end

        -- build inventory from upvalue
        local itemDict  = {}
        local itemOrder = {}
        for _, e in pairs(data.Inventory) do
            if type(e) == "table" and type(e.ItemData) == "table" then
                local id  = e.ItemData.ID
                local amt = tonumber(e.Amount) or 0
                if type(id) == "string" and amt > 0 then
                    if not itemDict[id] then
                        itemDict[id] = {
                            id    = id,
                            name  = NameCache[id] or id,
                            image = ImageCache[id] or "",
                            count = 0,
                        }
                        table.insert(itemOrder, id)
                    end
                    itemDict[id].count = itemDict[id].count + amt
                end
            end
        end

        local units   = {}
        local allItems = {}
        for _, id in ipairs(itemOrder) do
            local item = itemDict[id]
            table.insert(allItems, item)
            if id:find("^unit_") and id ~= "unit_more" then
                table.insert(units, item)
            end
        end

        local seeds       = math.floor(tonumber(data.Seeds)       or 0)
        local luckyBlocks = math.floor(tonumber(data.LuckyBlocks) or 0)

        local inLobby  = isLobby()
        local stateStr = inLobby and "lobby" or "farming"

        local invKey = ""
        for _, item in ipairs(units) do
            invKey = invKey .. item.id .. "=" .. item.count .. ";"
        end
        local payloadKey = stateStr .. "|" .. seeds .. "|" .. luckyBlocks .. "|" .. invKey

        local now = os.time()
        local forceSync = (now - lastForcedSync) >= FORCE_INTERVAL
        if payloadKey == lastPayloadKey and not forceSync then return end
        if forceSync then lastForcedSync = now end

        local body = "[" .. HttpService:JSONEncode({
            username     = LP.Name,
            seeds        = seeds,
            lucky_blocks = luckyBlocks,
            units        = #units,
            lobby        = stateStr,
            status       = "online",
            inventory    = allItems,
            updated_at   = getISO8601(),
        }) .. "]"

        local res = requestFunc({ Url = url, Method = "POST", Headers = headers, Body = body })
        if res and res.StatusCode and res.StatusCode >= 200 and res.StatusCode < 300 then
            lastPayloadKey = payloadKey
            print(string.format("[Supabase] Synced: %s | seeds: %d | lb: %d | units: %d | %s",
                LP.Name, seeds, luckyBlocks, #units, stateStr))
        else
            warn("[Supabase ERR]:", res and res.StatusCode or "no response", res and res.Body or "")
        end
    end

    -- ── LOOP ──────────────────────────────────────────────────────
    pcall(sendData)
    while true do
        task.wait(SEND_INTERVAL)
        local ok2, err = pcall(sendData)
        if not ok2 then warn("[Supabase] Loop error:", err) end
    end
end)
