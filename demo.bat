start cmd /k bs
timeout 1
start cmd /k hcdev --path=%~dp0 -bootstrapServer=localhost:3142 -execpath=%USERPROFILE%\.holochaindev1 -DHTport=6001 -agentID=alex web 3141
start cmd /k hcdev --path=%~dp0 -bootstrapServer=localhost:3142 -execpath=%USERPROFILE%\.holochaindev2 -DHTport=6002 -agentID=billy web 4141
timeout 6
start http://localhost:3141/
start http://localhost:4141/